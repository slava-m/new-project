import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {createRequire} from 'node:module';
import {indicators,validBar,splitClosed} from './indicators.mjs';
import {evaluateStrategy as evaluateSetup} from './strategy.mjs';
import {fetchDaily} from './daily.mjs';
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
const keyPath=path.join(root,'data','provider-key.json'); let providerKey=process.env.TWELVEDATA_API_KEY||(fs.existsSync(keyPath)?JSON.parse(fs.readFileSync(keyPath,'utf8')).key:''); let dailyRunning=false;
const queue=new Map();let busy=false,modelReady=false; const analyzed=new Map();
function snapshot(){return {...state,universe,strategy:config.research,positions:state.positions.map(({key,...p})=>p),now:Date.now(),symbols:Object.fromEntries(Object.entries(state.symbols).map(([s,v])=>[s,{...v,bars:v.bars.slice(-1000),signal:evaluateSetup(dailyMode?v.bars:splitClosed(v.bars),{...config.research,now:Date.now()/1000,connected:dailyMode?v.dataStatus==='ready':state.connection==='connected'&&v.barMode!=='cached'}),quoteStale:!v.quoteAt||Date.now()-v.quoteAt>90000,barStale:!v.bars.length||Date.now()/1000-v.bars.at(-1).time>(dailyMode?8*86400:180)}]))};}
function broadcast(){const msg='data: '+JSON.stringify(snapshot())+'\n\n';for(const res of clients)res.write(msg);}
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
 if(analyzed.get(symbol)===last.time)return;
 analyzed.set(symbol,last.time);queue.set(symbol,{symbol,bars:closed.slice(-250),mode:state.symbols[symbol].barMode,received:state.symbols[symbol].lastUpdate});pump();
}
async function pump(){
 if(busy||!modelReady||!queue.size)return;busy=true;
 const [symbol,job]=queue.entries().next().value;queue.delete(symbol);
 const facts=indicators(job.bars,{timeframe:dailyMode?'1day':'1min'}),last=job.bars.at(-1);
 const signal=evaluateSetup(job.bars,{...config.research,now:Date.now()/1000,connected:state.symbols[symbol].dataStatus==='ready'});
 state.agent={...state.agent,status:'analyzing',message:'Проверка рассчитанного статуса '+symbol};broadcast();
 let modelConfirmed=false;
 try{
 const res=await fetch(new URL('/api/generate',ollamaUrl),{method:'POST',headers:{'Content-Type':'application/json'},redirect:'error',signal:AbortSignal.timeout(120000),
 body:JSON.stringify({model:config.ollama.model,stream:false,format:{type:'object',properties:{status:{type:'string',enum:['candidate','waiting','excluded','insufficient']}},required:['status'],additionalProperties:false},options:{temperature:0,num_predict:80},prompt:'Верни только JSON с единственным полем status, точно равным вычисленному research.status. Не добавляй текст, числа и другие поля. '+JSON.stringify({symbol,research:signal})})});
 if(res.ok){const data=await res.json();modelConfirmed=validateAssessment(data.response,signal);}
 }catch{}
 try{
 const result={symbol,strategyVersion:config.research.version,timeframe:dailyMode?'1day':'1min',barStart:last.time,barEnd:last.time+(dailyMode?86400:60),generated:Date.now(),received:job.received,mode:job.mode,facts,modelConfirmed,text:buildReport({symbol,bars:job.bars,signal,modelConfirmed})};
 db.prepare('INSERT INTO analyses(symbol,time,generated,body) VALUES(?,?,?,?)').run(symbol,last.time,result.generated,JSON.stringify(result));
 state.symbols[symbol].analysis=result;state.agent={...state.agent,status:'ready',message:'Проверяемый отчёт '+symbol+' готов'};
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
const routes={'/settings':['public/settings.html','text/html; charset=utf-8'],'/settings.js':['public/settings.js','text/javascript; charset=utf-8'],'/':['public/index.html','text/html; charset=utf-8'],'/app.js':['public/app.js','text/javascript; charset=utf-8'],'/style.css':['public/style.css','text/css'],'/charts.js':['node_modules/lightweight-charts/dist/lightweight-charts.standalone.production.js','text/javascript']};
const server=http.createServer((req,res)=>{
 const host=req.headers.host;if(!['127.0.0.1:'+config.port,'localhost:'+config.port].includes(host)){res.writeHead(403);return res.end();}
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; frame-src 'self' https://*.tradingview.com https://*.tradingview-widget.com; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'");
 if(req.url.startsWith('/settings'))res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-src 'none'; frame-ancestors 'self'");
if(req.method==='POST'&&req.url==='/api/provider'){
 if(!['http://127.0.0.1:'+config.port,'http://localhost:'+config.port].includes(req.headers.origin)||req.headers['content-type']!=='application/json'){res.writeHead(403);return res.end();}
 let body='';req.on('data',chunk=>{body+=chunk;if(body.length>2048){res.writeHead(413);res.end();req.destroy();}});
 req.on('end',async()=>{try{const {key}=JSON.parse(body);if(typeof key!=='string'||key.length<8||key.length>256||/\s/.test(key))throw Error('Проверьте формат ключа');providerKey=key;fs.writeFileSync(keyPath,JSON.stringify({key}),{mode:0o600});await refreshDaily();res.setHeader('Content-Type','application/json');res.end(JSON.stringify({status:state.daily.status,message:state.daily.message}));}catch(e){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({message:'Настройка не завершена. Проверьте ключ и доступ к данным.'}));}});return;
}
if(req.method!=='GET'){res.writeHead(405);return res.end();}
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/api/state'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(snapshot()));}
 if(url.pathname==='/events'){res.writeHead(200,{'Content-Type':'text/event-stream','Connection':'keep-alive'});clients.add(res);res.write('data: '+JSON.stringify(snapshot())+'\n\n');req.on('close',()=>clients.delete(res));return;}
 const route=routes[url.pathname];if(!route){res.writeHead(404);return res.end('Not found');}
 res.setHeader('Content-Type',route[1]);fs.createReadStream(path.join(root,route[0])).on('error',()=>res.destroy()).pipe(res);
});
const beat=setInterval(broadcast,1000);const modelCheck=setInterval(checkModel,30000);
server.listen(config.port,'127.0.0.1',()=>{console.log('Local panel: http://127.0.0.1:'+config.port);if(config.ibkr.enabled!==false)connect();if(dailyMode)refreshDaily();checkModel();});
async function refreshDaily(){ if(dailyRunning)return;
 if(!providerKey){state.daily={status:'unconfigured',message:'Для дневного анализа нужен ключ Twelve Data, сохранённый локально'};broadcast();return;}
 dailyRunning=true; state.daily={status:'loading',message:'Загрузка завершённых дневных свечей'};broadcast();
 let count=0;
 for(const symbol of config.symbols){try{const bars=await fetchDaily(symbol,providerKey);const v=state.symbols[symbol];v.bars=bars;v.dataStatus='ready';v.barMode='Twelve Data · дневные · split-adjusted';v.lastUpdate=Date.now();v.quote=null;v.quoteAt=null;db.prepare('INSERT INTO daily_history VALUES(?,?) ON CONFLICT(symbol) DO UPDATE SET payload=excluded.payload').run(symbol,JSON.stringify(bars));schedule(symbol,bars);count++;}catch(e){state.symbols[symbol].dataStatus='error';error(e.message.split(providerKey).join('[redacted]'));}}
 state.daily={status:count===config.symbols.length?'ready':'error',message:count===config.symbols.length?'Дневные свечи обновлены':'Не все дневные данные получены; см. диагностику'};dailyRunning=false;broadcast();
}
const dailyTimer=setInterval(()=>{if(dailyMode)refreshDaily();},6*3600000);
function shutdown(){clearInterval(dailyTimer);stopped=true;clearInterval(beat);clearInterval(modelCheck);clearTimeout(retryTimer);clearTimeout(connectTimer);ib?.disconnect();for(const res of clients)res.end();server.close(()=>{db.close();process.exit(0);});}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
