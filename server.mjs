import {createHourlyArchive} from './hour-archive.mjs';
import {createIntraday} from './intraday.mjs';
import {installSpeech} from './speech.mjs';
import {createModelQueue} from './model-queue.mjs';
import {installChat} from './chat.mjs';
const modelQueue=createModelQueue();
import http from 'node:http';
import {analysisSlot,completedSessionKey,hourlyInterval} from './hourly.mjs';
import {Worker} from 'node:worker_threads';
import {archiveDefaults,nextArchiveJob,consumeArchiveCredit,utcDay} from './archive.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {createRequire} from 'node:module';
import {indicators,validBar,splitClosed} from './indicators.mjs';
import {evaluateStrategy as evaluateSetup} from './strategy.mjs';
import {fetchFreeDaily,providerLabels} from './providers.mjs';
import {buildReport,validateAssessment} from './report.mjs';
const require=createRequire(import.meta.url);
const {IBApi,EventName}=require('@stoqey/ib');
const root=path.dirname(fileURLToPath(import.meta.url));
const config=JSON.parse(fs.readFileSync(path.join(root,'config.json'),'utf8').replace(/^\uFEFF/,''));
const universe=JSON.parse(fs.readFileSync(path.join(root,'universe.json'),'utf8')); config.symbols=universe.symbols.filter(s=>!universe.exclude.includes(s));
if(!['127.0.0.1','localhost','::1'].includes(config.ibkr.host))throw Error('IBKR host must be loopback');
const ollamaUrl=new URL(config.ollama.url);
if(ollamaUrl.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(ollamaUrl.hostname)||ollamaUrl.username||ollamaUrl.password)throw Error('Only local Ollama is allowed');
if(/cloud/i.test(config.ollama.model))throw Error('Cloud models are forbidden');
fs.mkdirSync(path.join(root,'data'),{recursive:true});
const db=new DatabaseSync(path.join(root,'data','market.sqlite'));
db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS bars(symbol TEXT,time INTEGER,open REAL,high REAL,low REAL,close REAL,volume REAL,received INTEGER,source TEXT,PRIMARY KEY(symbol,time)); CREATE TABLE IF NOT EXISTS analyses(id INTEGER PRIMARY KEY,symbol TEXT,time INTEGER,generated INTEGER,body TEXT);');
const upsert=db.prepare('INSERT INTO bars VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(symbol,time) DO UPDATE SET open=excluded.open,high=excluded.high,low=excluded.low,close=excluded.close,volume=excluded.volume,received=excluded.received,source=excluded.source');
const state={connection:'disconnected',connectionMessage:'Ожидание TWS / IB Gateway',positions:[],positionsAt:null,positionsComplete:false,symbols:{},errors:[],agent:{status:'checking',model:config.ollama.model,message:'Проверка локальной модели'},config:{ibkr:config.ibkr,port:config.port}};
for(const symbol of config.symbols){
 const bars=db.prepare('SELECT * FROM bars WHERE symbol=? ORDER BY time DESC LIMIT 1000').all(symbol).reverse();
 const analysis=db.prepare('SELECT body FROM analyses WHERE symbol=? ORDER BY id DESC LIMIT 1').get(symbol);
 state.symbols[symbol]={bars,quote:null,quoteAt:null,quoteDataTime:null,marketDataType:0,lastUpdate:null,barMode:'cached',analysis:analysis?JSON.parse(analysis.body):null};
}
db.exec('CREATE TABLE IF NOT EXISTS daily_history(symbol TEXT PRIMARY KEY,payload TEXT)'); const dailyMode=config.analysisTimeframe==='1day'; if(dailyMode){for(const [symbol,v] of Object.entries(state.symbols)){const saved=db.prepare('SELECT payload FROM daily_history WHERE symbol=?').get(symbol); v.bars=saved?JSON.parse(saved.payload):[];v.analysis=null;v.dataStatus='cached';v.barMode='Дневной кеш';} state.connectionMessage='Портфель IBKR отложен';} state.daily=dailyMode?{status:'checking',message:'Проверка источника дневных свечей'}:null;
const clients=new Set(); let stopped=false,ib,attempt=0,generation=0,retryTimer,connectTimer;
const keyPath=path.join(root,'data','provider-key.json'); let providerKey=process.env.TWELVEDATA_API_KEY||(fs.existsSync(keyPath)?JSON.parse(fs.readFileSync(keyPath,'utf8')).key:''); let dailyRunning=false,nextSourceCheckAt=Date.now();
db.exec('CREATE TABLE IF NOT EXISTS archive_meta(symbol TEXT PRIMARY KEY,payload TEXT); CREATE TABLE IF NOT EXISTS archive_quota(id INTEGER PRIMARY KEY,payload TEXT)');
const archiveMeta=Object.fromEntries(db.prepare('SELECT symbol,payload FROM archive_meta').all().map(r=>[r.symbol,JSON.parse(r.payload)]));let archiveQuota=JSON.parse(db.prepare('SELECT payload FROM archive_quota WHERE id=1').get()?.payload||'{}');let yahooQuota=JSON.parse(db.prepare('SELECT payload FROM archive_quota WHERE id=2').get()?.payload||'{}');
function saveMeta(symbol,value){archiveMeta[symbol]=value;db.prepare('INSERT INTO archive_meta VALUES(?,?) ON CONFLICT(symbol) DO UPDATE SET payload=excluded.payload').run(symbol,JSON.stringify(value));}
function saveQuota(){db.prepare('INSERT INTO archive_quota VALUES(1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(JSON.stringify(archiveQuota));db.prepare('INSERT INTO archive_quota VALUES(2,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(JSON.stringify(yahooQuota));}
for(const [symbol,v] of Object.entries(state.symbols)){v.dataProvider=archiveMeta[symbol]?.provider||(v.bars.length?'twelvedata':null);v.lastUpdate=archiveMeta[symbol]?.fetchedAt||null;if(v.dataProvider)v.barMode=providerLabels[v.dataProvider];}
const dailySessionKey=now=>completedSessionKey(now)+':'+(config.dailyHistoryYears||2)+'y';
const dataSlot=()=>Math.floor(Date.now()/9000)%3;
const hourlyArchive=config.hourlyArchive?.enabled?createHourlyArchive({db,symbols:config.symbols,years:config.hourlyArchive.historyYears||1,getQuota:()=>yahooQuota,canFetch:()=>dataSlot()===1,consume:()=>{yahooQuota=consumeArchiveCredit(yahooQuota,Date.now());saveQuota();},pause:until=>{yahooQuota.pauseUntil=until;saveQuota();},broadcast}):null;
const intraday=config.intraday?.enabled?createIntraday({db,symbols:config.symbols,getQuota:()=>yahooQuota,canFetch:()=>dataSlot()===0,consume:()=>{yahooQuota=consumeArchiveCredit(yahooQuota,Date.now());saveQuota();},pause:until=>{yahooQuota.pauseUntil=until;saveQuota();},broadcast,refreshMs:config.intraday.refreshMs||3600000}):null;
const queue=new Map();let busy=false,modelReady=false; const analyzed=new Map();
const analysisInterval=config.analysisIntervalMs||hourlyInterval;let currentAnalysisSlot=-1,lastAnalysisStarted=null;const cycleReviewed=new Set();
function startHourlyAnalysis(){const slot=analysisSlot(Date.now(),analysisInterval);if(slot===currentAnalysisSlot)return;currentAnalysisSlot=slot;lastAnalysisStarted=Date.now();cycleReviewed.clear();for(const symbol of config.symbols){const v=state.symbols[symbol];if(!v.bars.length)continue;const saved=db.prepare('SELECT body FROM analyses WHERE symbol=? ORDER BY id DESC LIMIT 1').get(symbol);let previous=null;try{previous=saved?JSON.parse(saved.body):null;}catch{}if(previous?.generated>=slot*analysisInterval&&previous.strategyVersion===config.research.version){v.analysis=previous;cycleReviewed.add(symbol);continue;}schedule(symbol,v.bars);}broadcast();}
const historyCache=new Map(),signalCache=new Map(),historyQueue=new Map();let historyBusy=null;
const historyWorker=new Worker(new URL('./history-worker.mjs',import.meta.url));
function revision(v){return v.lastUpdate+':'+v.bars.length+':'+v.bars.at(-1)?.time;}
function signalFor(symbol,v){const key=revision(v)+':'+v.dataStatus+':'+Math.floor(Date.now()/60000);if(signalCache.get(symbol)?.key!==key)signalCache.set(symbol,{key,value:evaluateSetup(dailyMode?v.bars:splitClosed(v.bars),{...config.research,now:Date.now()/1000,connected:dailyMode?!!v.bars.length:state.connection==='connected'&&v.barMode!=='cached'})});return signalCache.get(symbol).value;}
function historyFor(symbol,v){return historyCache.get(symbol)?.key===revision(v)?historyCache.get(symbol).value:null;}
function queueHistory(symbol){const v=state.symbols[symbol];if(!v.bars.length)return;historyQueue.set(symbol,{symbol,bars:v.bars,options:config.research,revision:revision(v)});pumpHistory();}
function pumpHistory(){if(historyBusy||!historyQueue.size||stopped)return;const [symbol,job]=historyQueue.entries().next().value;historyQueue.delete(symbol);historyBusy=job;historyWorker.postMessage(job);}
historyWorker.on('message',job=>{historyBusy=null;const v=state.symbols[job.symbol];if(job.history&&job.revision===revision(v)){job.history.dataProvider=v.dataProvider;if(v.dataProvider==='yahoo')job.history.limitations.push('Yahoo Finance: метод корректировки корпоративных действий не подтверждён; источник экспериментальный');historyCache.set(job.symbol,{key:job.revision,value:job.history});if(!v.analysis)v.analysis={generated:Date.now(),barStart:v.bars.at(-1).time,text:buildReport({symbol:job.symbol,bars:v.bars,signal:signalFor(job.symbol,v),modelConfirmed:false})};}if(job.error)state.errors.unshift({at:Date.now(),message:job.error});broadcast();pumpHistory();});
historyWorker.on('error',()=>{historyBusy=null;state.errors.unshift({at:Date.now(),message:'Фоновая историческая симуляция остановилась'});broadcast();});
function snapshot(detailSymbol=config.symbols[0]){const rows=Object.fromEntries(Object.entries(state.symbols).map(([symbol,v])=>{const full=symbol===detailSymbol,signal=signalFor(symbol,v),h=historyFor(symbol,v);return [symbol,{...v,belowSma150:signal.facts&&Number.isFinite(signal.facts.close)&&Number.isFinite(signal.facts.sma150)?signal.facts.close<signal.facts.sma150:null,bars:full?v.bars.slice(-1000):v.bars.slice(-1),barCount:v.bars.length,analysis:full?v.analysis:null,history:h?(full?h:{coverage:h.coverage,signals:h.signals,skipped:h.skipped,expired:h.expired,metrics:h.metrics}):null,signal:full?signal:{status:signal.status,reasons:signal.reasons.slice(0,1)},quoteStale:!v.quoteAt||Date.now()-v.quoteAt>90000,barStale:!v.bars.length||Date.now()/1000-v.bars.at(-1).time>(dailyMode?8*86400:180)}];}));const loaded=Object.values(state.symbols).filter(v=>v.bars.length).length;return {...state,hourlyArchive:hourlyArchive?.summary()||null,higherFrames:hourlyArchive?.detail(detailSymbol)||null,historyTargets:{dailyUpdated:Object.values(archiveMeta).filter(m=>m.checkedSessionKey?.endsWith(':'+(config.dailyHistoryYears||2)+'y')).length,dailyYears:config.dailyHistoryYears||2,hourlyYears:config.hourlyArchive?.historyYears||1,minuteYears:config.intraday?.requestedHistoryYears||1,minuteCoverageLimited:true},intraday:intraday?.summary()||null,minute:intraday?.detail(detailSymbol)||null,daily:{...state.daily,nextCheckAt:dailyRunning?null:nextSourceCheckAt,checking:dailyRunning},universe,strategy:config.research,positions:state.positions.map(({key,...p})=>p),now:Date.now(),analysisSchedule:{intervalMinutes:analysisInterval/60000,lastStarted:lastAnalysisStarted,nextRun:(currentAnalysisSlot+1)*analysisInterval,reviewed:cycleReviewed.size,pending:queue.size+Number(busy),total:config.symbols.length},archive:{total:config.symbols.length,loaded,pending:config.symbols.length-loaded,simulated:historyCache.size,requestsToday:(archiveQuota.day===utcDay(Date.now())?archiveQuota.used||0:0)+(yahooQuota.day===utcDay(Date.now())?yahooQuota.used||0:0),dailyBudget:archiveDefaults.dailyBudget*(providerKey?2:1),sources:{yahoo:{used:yahooQuota.day===utcDay(Date.now())?yahooQuota.used||0:0,budget:archiveDefaults.dailyBudget,pauseUntil:yahooQuota.pauseUntil||0,keyRequired:false},twelvedata:{used:archiveQuota.day===utcDay(Date.now())?archiveQuota.used||0:0,budget:archiveDefaults.dailyBudget,configured:!!providerKey,pauseUntil:archiveQuota.pauseUntil||0,keyRequired:true}},nextRequest:yahooQuota.nextAt||archiveQuota.nextAt||null,pauseUntil:yahooQuota.pauseUntil||archiveQuota.pauseUntil||null,historyQueue:historyQueue.size+Number(!!historyBusy),modelQueue:queue.size+Number(busy)},symbols:rows};}
function broadcast(){for(const client of clients)client.res.write('data: '+JSON.stringify(snapshot(client.symbol))+'\n\n');}
function error(message,code,id){state.errors.unshift({at:Date.now(),message:String(message),code,id});state.errors=state.errors.slice(0,12);broadcast();}
async function checkModel(){
 try {const res=await fetch(new URL('/api/tags',ollamaUrl),{signal:AbortSignal.timeout(4000),redirect:'error'});if(!res.ok)throw Error('HTTP '+res.status);
 const data=await res.json();const found=data.models?.find(m=>m.name===config.ollama.model);
 if(!found)throw Error('Модель '+config.ollama.model+' не установлена');
 if(found.remote_host||found.remote_model||/cloud/i.test(found.name))throw Error('Удалённая модель запрещена');
 modelReady=true;if(!busy)state.agent={...state.agent,status:'ready',message:'Локальная модель готова'};pump();
 }catch(e){modelReady=false;state.agent={...state.agent,status:'unavailable',message:'Ollama недоступна: '+e.message};}broadcast();
}
function schedule(symbol,closed){
 if(!closed.length)return;const last=closed.at(-1);
 const slot=analysisSlot(Date.now(),analysisInterval),key=last.time+':'+slot+':'+state.symbols[symbol].lastUpdate;if(analyzed.get(symbol)===key)return;cycleReviewed.delete(symbol);
 analyzed.set(symbol,key);queue.set(symbol,{slot,symbol,bars:closed.slice(),mode:state.symbols[symbol].barMode,received:state.symbols[symbol].lastUpdate});pump();
}
async function pump(){
 if(busy||!modelReady||!queue.size)return;busy=true;
 const [symbol,job]=queue.entries().next().value;queue.delete(symbol);
 const facts=indicators(job.bars,{timeframe:dailyMode?'1day':'1min'}),last=job.bars.at(-1);
 const signal=evaluateSetup(job.bars,{...config.research,now:Date.now()/1000,connected:dailyMode?!!state.symbols[symbol].bars.length:state.connection==='connected'});
 state.agent={...state.agent,status:'analyzing',message:'Проверка рассчитанного статуса '+symbol};broadcast();
 let modelConfirmed=false;
 try{
 const res=await modelQueue(()=>fetch(new URL('/api/generate',ollamaUrl),{method:'POST',headers:{'Content-Type':'application/json'},redirect:'error',signal:AbortSignal.timeout(120000),
 body:JSON.stringify({model:config.ollama.model,stream:false,format:{type:'object',properties:{status:{type:'string',enum:['candidate','waiting','excluded','insufficient']}},required:['status'],additionalProperties:false},keep_alive:'10m',options:{temperature:0,num_predict:80,...config.ollama.options},prompt:'Верни только JSON с единственным полем status, точно равным вычисленному research.status. Не добавляй текст, числа и другие поля. '+JSON.stringify({symbol,research:signal})})}));
 if(res.ok){const data=await res.json();modelConfirmed=validateAssessment(data.response,signal);}
 }catch{}
 try{
 if(job.received!==state.symbols[symbol].lastUpdate&&config.reanalyzeOnData!==false){schedule(symbol,state.symbols[symbol].bars);return;}
 const result={symbol,strategyVersion:config.research.version,timeframe:dailyMode?'1day':'1min',barStart:last.time,barEnd:last.time+(dailyMode?86400:60),generated:Date.now(),received:job.received,mode:job.mode,facts,modelConfirmed,text:buildReport({symbol,bars:job.bars,signal,modelConfirmed})};
 db.prepare('INSERT INTO analyses(symbol,time,generated,body) VALUES(?,?,?,?)').run(symbol,last.time,result.generated,JSON.stringify(result));
 state.symbols[symbol].analysis=result;if(job.slot===currentAnalysisSlot)cycleReviewed.add(symbol);state.agent={...state.agent,status:'ready',message:'Проверяемый отчёт '+symbol+' готов'};
 }catch{analyzed.delete(symbol);state.agent={...state.agent,status:'error',message:'Не удалось сохранить отчёт'};}
 finally{busy=false;broadcast();pump();}
}

function bar(symbol,time,open,high,low,close,volume,update){
 const v=state.symbols[symbol],b={time:Number(time),open:Number(open),high:Number(high),low:Number(low),close:Number(close),volume:Number.isFinite(Number(volume))&&Number(volume)>=0?Number(volume):null,received:Date.now(),source:update?'stream':'historical'};
 if(!validBar(b))return;
 const prev=v.bars.at(-1);const i=v.bars.findIndex(x=>x.time===b.time);
 if(i>=0)v.bars[i]=b;else{v.bars.push(b);v.bars.sort((a,b)=>a.time-b.time);v.bars=v.bars.slice(-1000);}
 upsert.run(symbol,b.time,b.open,b.high,b.low,b.close,b.volume,b.received,b.source);
 v.lastUpdate=b.received;
 if(update){v.barMode='IBKR historicalDataUpdate';if(prev&&b.time>prev.time)schedule(symbol,splitClosed(v.bars).filter(x=>x.time<b.time));}
 else if(v.barMode==='cached')v.barMode='IBKR history';
}
function connect(){
 if(stopped)return;const token=++generation;attempt++;const api=new IBApi(config.ibkr);ib=api;let ready=false,ended=false;
 state.connection='connecting';state.connectionMessage='Подключение '+config.ibkr.host+':'+config.ibkr.port;broadcast();
 const ids=new Map();for(let i=0;i<config.symbols.length;i++){ids.set(100+i,config.symbols[i]);ids.set(200+i,config.symbols[i]);}
 function retry(message){
 if(ended||token!==generation||stopped)return;ended=true;clearTimeout(connectTimer);api.disconnect();
 state.connection='disconnected';state.connectionMessage=message;state.positionsComplete=false;
 for(const v of Object.values(state.symbols)){v.marketDataType=0;v.barMode='cached';}
 broadcast();retryTimer=setTimeout(connect,Math.min(30000,3000*attempt));
 }
 api.on(EventName.error,(e,code,id)=>{
 const msg=e?.message??String(e);
 if([2104,2106,2158].includes(code))return;
 error(msg,code,id);
 if(code===1100){state.connection='degraded';state.connectionMessage='IBKR потерял связь с сервером';for(const v of Object.values(state.symbols))v.marketDataType=0;broadcast();}
 if(code===1101||code===1102)retry('Восстановление подписок после потери связи');
 if([502,504,326].includes(code)||/ECONNREFUSED|ECONNRESET|ENOTFOUND/.test(msg))retry(msg);
 });
 api.on(EventName.disconnected,()=>retry('TWS / IB Gateway отключён; повтор через несколько секунд'));
 api.on(EventName.nextValidId,()=>{
 if(ready||ended)return;ready=true;attempt=0;clearTimeout(connectTimer);state.connection='connected';state.connectionMessage='API подключён; качество данных проверяется отдельно';
 state.positions=[];state.positionsComplete=false;state.positionsAt=null;
 api.reqPositions();api.reqMarketDataType(config.ibkr.marketDataType);
 config.symbols.forEach((symbol,i)=>{
 const contract={symbol,secType:'STK',exchange:'SMART',currency:'USD'};
 api.reqMktData(100+i,contract,'',false,false);
 api.reqHistoricalData(200+i,contract,'','2 D','1 min','TRADES',false,2,true);
 });broadcast();
 });
 api.on(EventName.position,(account,contract,pos,avgCost)=>{
 const key=account+':'+contract.conId;const p={key,symbol:contract.symbol,currency:contract.currency,quantity:Number(pos),averageCost:avgCost,updated:Date.now()};
 const i=state.positions.findIndex(x=>x.key===key);if(i>=0)state.positions[i]=p;else state.positions.push(p);
 state.positions=state.positions.filter(x=>x.quantity!==0);state.positionsAt=Date.now();broadcast();
 });
 api.on(EventName.positionEnd,()=>{state.positionsComplete=true;state.positionsAt=Date.now();broadcast();});
 api.on(EventName.marketDataType,(id,type)=>{const s=ids.get(id);if(s){state.symbols[s].marketDataType=type;broadcast();}});
 api.on(EventName.tickString,(id,type,value)=>{const s=ids.get(id);if(s&&[45,88].includes(type)&&Number.isFinite(Number(value)))state.symbols[s].quoteDataTime=Number(value)*1000;});
 api.on(EventName.tickPrice,(id,type,value)=>{const s=ids.get(id);if(s&&[4,68].includes(type)&&Number.isFinite(value)&&value>0){state.symbols[s].quote=value;state.symbols[s].quoteAt=Date.now();}});
 api.on(EventName.historicalData,(id,...args)=>{const s=ids.get(id);if(s)bar(s,...args.slice(0,6),false);});
 api.on(EventName.historicalDataUpdate,(id,...args)=>{const s=ids.get(id);if(s)bar(s,...args.slice(0,6),true);});
 connectTimer=setTimeout(()=>retry('API не ответил за 12 секунд. Проверьте порт и разрешения TWS'),12000);
 api.connect(config.ibkr.clientId);
}
const handleSpeech=installSpeech(root,config.port);
const handleChat=installChat({root,config,snapshot,modelQueue,ollamaUrl,db});
const routes={'/chat.js':['public/chat.js','text/javascript; charset=utf-8'],'/i18n.js':['public/i18n.mjs','text/javascript; charset=utf-8'],'/filters.js':['public/filters.mjs','text/javascript; charset=utf-8'],'/settings':['public/settings.html','text/html; charset=utf-8'],'/settings.js':['public/settings.js','text/javascript; charset=utf-8'],'/':['public/index.html','text/html; charset=utf-8'],'/app.js':['public/app.js','text/javascript; charset=utf-8'],'/style.css':['public/style.css','text/css'],'/charts.js':['node_modules/lightweight-charts/dist/lightweight-charts.standalone.production.js','text/javascript']};
const server=http.createServer((req,res)=>{
 const host=req.headers.host;if(!['127.0.0.1:'+config.port,'localhost:'+config.port].includes(host)){res.writeHead(403);return res.end();}
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; frame-src 'self' https://*.tradingview.com https://*.tradingview-widget.com; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; media-src 'self' blob:; frame-ancestors 'none'");
 if(req.url.startsWith('/settings'))res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-src 'none'; frame-ancestors 'self'");
if(handleSpeech(req,res)||handleChat(req,res))return;

if(req.method==='POST'&&req.url==='/api/analyze'){
 if(!['http://127.0.0.1:'+config.port,'http://localhost:'+config.port].includes(req.headers.origin)||req.headers['content-type']!=='application/json'){res.writeHead(403);return res.end();}
 if(!modelReady||busy||queue.size){res.writeHead(!modelReady?503:409,{'Content-Type':'application/json'});return res.end(JSON.stringify({message:!modelReady?'Локальная модель недоступна':'Анализ уже выполняется; дождитесь завершения очереди'}));}
 let body='',failed=false;req.on('data',c=>{body+=c;if(body.length>1024){failed=true;if(!res.writableEnded){res.writeHead(413);res.end();}}});
 req.on('end',()=>{if(failed)return;try{const {symbol,scope}=JSON.parse(body);if(!['selected','all'].includes(scope)||scope==='selected'&&!config.symbols.includes(symbol))throw Error();const targets=(scope==='all'?config.symbols:[symbol]).filter(s=>state.symbols[s].bars.length);for(const ticker of targets){analyzed.delete(ticker);queueHistory(ticker);schedule(ticker,state.symbols[ticker].bars);}res.writeHead(202,{'Content-Type':'application/json'});res.end(JSON.stringify({queued:targets.length,message:'Ручной анализ поставлен в очередь'}));broadcast();}catch{res.writeHead(400);res.end();}});return;
}

if(req.method==='POST'&&req.url==='/api/provider'){
 if(!['http://127.0.0.1:'+config.port,'http://localhost:'+config.port].includes(req.headers.origin)||req.headers['content-type']!=='application/json'){res.writeHead(403);return res.end();}
 let body='';req.on('data',chunk=>{body+=chunk;if(body.length>2048){res.writeHead(413);res.end();req.destroy();}});
 req.on('end',async()=>{try{const {key}=JSON.parse(body);if(typeof key!=='string'||key.length<8||key.length>256||/\s/.test(key))throw Error('Проверьте формат ключа');providerKey=key;nextSourceCheckAt=0;fs.writeFileSync(keyPath,JSON.stringify({key}),{mode:0o600});await refreshDaily();res.setHeader('Content-Type','application/json');res.end(JSON.stringify({status:state.daily.status,message:state.daily.message}));}catch(e){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({message:'Настройка не завершена. Проверьте ключ и доступ к данным.'}));}});return;
}
if(req.method!=='GET'){res.writeHead(405);return res.end();}
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/api/state'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(snapshot(url.searchParams.get('symbol')||config.symbols[0])));}
 if(url.pathname==='/events'){intraday?.prioritize(url.searchParams.get('interval')==='1min'?url.searchParams.get('symbol'):null);res.writeHead(200,{'Content-Type':'text/event-stream','Connection':'keep-alive'});const client={res,symbol:config.symbols.includes(url.searchParams.get('symbol'))?url.searchParams.get('symbol'):config.symbols[0]};clients.add(client);res.write('data: '+JSON.stringify(snapshot(client.symbol))+'\n\n');req.on('close',()=>clients.delete(client));return;}
 const route=routes[url.pathname];if(!route){res.writeHead(404);return res.end('Not found');}
 res.setHeader('Content-Type',route[1]);fs.createReadStream(path.join(root,route[0])).on('error',()=>res.destroy()).pipe(res);
});
const beat=setInterval(broadcast,15000);const modelCheck=setInterval(checkModel,30000);
server.listen(config.port,'127.0.0.1',()=>{console.log('Local panel: http://127.0.0.1:'+config.port);if(config.ibkr.enabled!==false)connect();if(dailyMode){for(const symbol of config.symbols)queueHistory(symbol);startHourlyAnalysis();refreshDaily();}checkModel();});
async function refreshDaily(){if(dailyRunning||stopped||Date.now()<nextSourceCheckAt)return;dailyRunning=true;nextSourceCheckAt=Date.now()+1000;
 try{const now=Date.now(),yJob=nextArchiveJob(config.symbols,archiveMeta,yahooQuota,now,{sessionKey:dailySessionKey(now)}),tJob=providerKey?nextArchiveJob(config.symbols,archiveMeta,archiveQuota,now,{sessionKey:dailySessionKey(now)}):null;const job=dataSlot()===2&&yJob.symbol?yJob:tJob?.symbol?tJob:yJob;if(job.symbol&&job===yJob&&dataSlot()!==2){nextSourceCheckAt=Date.now()+1000;return;}
 if(!job.symbol){nextSourceCheckAt=Math.max(Date.now()+1000,Math.min(...[yJob,tJob].filter(Boolean).map(j=>j.waitUntil||Date.now()+60000)));state.daily={status:job.reason==='up-to-date'?'ready':job.reason==='minute-budget'?'loading':'paused',message:job.reason==='up-to-date'?'Локальный архив обновлён':job.reason==='minute-budget'?'Постепенная загрузка: ожидание следующего запроса':'Бесплатные источники временно ограничили запросы; очередь сохранена'};return;}
 const symbol=job.symbol;state.daily={status:'loading',message:'Загружается трёхлетняя дневная история '+symbol};broadcast();
 try{const result=await fetchFreeDaily(symbol,{providerKey,outputsize:config.dailyHistoryBars||520,historyYears:config.dailyHistoryYears||2,
 allowed:source=>(source!=='yahoo'||dataSlot()===2)&&nextArchiveJob(config.symbols,archiveMeta,source==='yahoo'?yahooQuota:archiveQuota,Date.now(),{sessionKey:dailySessionKey(Date.now())}).symbol===symbol,
 consume:source=>{if(source==='yahoo')yahooQuota=consumeArchiveCredit(yahooQuota,Date.now());else archiveQuota=consumeArchiveCredit(archiveQuota,Date.now());saveQuota();},
 onFailure:(source,message)=>{if(/403|429|credits|limit|quota/i.test(message)){const q=source==='yahoo'?yahooQuota:archiveQuota;q.pauseUntil=/403|daily|day|800/i.test(message)?Date.parse(utcDay(Date.now())+'T00:00:00Z')+86400000:Date.now()+15*60000;saveQuota();}}});
 const {bars,source,label}=result,v=state.symbols[symbol];v.bars=bars;v.dataProvider=source;v.dataStatus='ready';v.barMode=label;v.lastUpdate=Date.now();v.quote=null;v.quoteAt=null;db.prepare('INSERT INTO daily_history VALUES(?,?) ON CONFLICT(symbol) DO UPDATE SET payload=excluded.payload').run(symbol,JSON.stringify(bars));saveMeta(symbol,{fetchedAt:Date.now(),retryAt:0,status:'ready',provider:source,checkedSessionKey:dailySessionKey(Date.now())});if(config.reanalyzeOnData!==false){queueHistory(symbol);schedule(symbol,bars);}state.daily.message='История '+symbol+' сохранена из '+(source==='yahoo'?'Yahoo Finance':'Twelve Data')+'; очередь продолжается';
 }catch(e){const message=String(e.message).split(providerKey||'__NO_KEY__').join('[redacted]');const globalLimit=(e.failures||[]).some(f=>/403|429|credits|limit|quota/i.test(f.message));if(!globalLimit)saveMeta(symbol,{...archiveMeta[symbol],retryAt:Date.now()+archiveDefaults.errorRetryMs,status:'error'});state.symbols[symbol].dataStatus=state.symbols[symbol].bars.length?'cached':'error';state.daily={status:globalLimit?'paused':'loading',message:globalLimit?'Источники ограничили запросы; очередь продолжится автоматически':'Не удалось получить '+symbol+'; очередь продолжает другие акции'};error(message);}
 }finally{dailyRunning=false;broadcast();}
}
const analysisTimer=setInterval(()=>{if(dailyMode)startHourlyAnalysis();},10000);
const hourTimer=setInterval(()=>hourlyArchive?.tick(),1000);
const minuteTimer=setInterval(()=>intraday?.tick(),1000);
const dailyTimer=setInterval(()=>{if(dailyMode)refreshDaily();},1000);
function shutdown(){clearInterval(hourTimer);hourlyArchive?.stop();clearInterval(minuteTimer);intraday?.stop();clearInterval(analysisTimer);clearInterval(dailyTimer);stopped=true;clearInterval(beat);clearInterval(modelCheck);clearTimeout(retryTimer);clearTimeout(connectTimer);ib?.disconnect();historyWorker.terminate();for(const client of clients)client.res.end();server.close(()=>{db.close();process.exit(0);});}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
