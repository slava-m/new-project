import {validBar} from './indicators.mjs';
export function normalizeDaily(payload,now=new Date()){
 if(payload.status==='error')throw Error(payload.message||'Ошибка поставщика');
 if(!Array.isArray(payload.values))throw Error('Нет дневных свечей в ответе');
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 const rows=new Map();
 for(const value of payload.values){
 const day=value.datetime;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||day>=today)continue;
 const time=Date.parse(day+'T00:00:00Z')/1000;
 if(new Date(time*1000).toISOString().slice(0,10)!==day)throw Error('Некорректная дата');
 const b={time,open:Number(value.open),high:Number(value.high),low:Number(value.low),close:Number(value.close),volume:value.volume===undefined||value.volume===null?null:Number(value.volume)};
 if(!validBar(b)||b.volume!==null&&(!Number.isFinite(b.volume)||b.volume<0))throw Error('Некорректные OHLCV');
 rows.set(time,b);
 }
 const bars=[...rows.values()].sort((a,b)=>a.time-b.time);
 if(!bars.length)throw Error('Завершённых дневных свечей нет');
 return bars;
}
export async function fetchDaily(symbol,apiKey,fetcher=fetch,outputsize=520){
 if(!apiKey)throw Error('Не настроен ключ поставщика дневных свечей');
 if(!Number.isInteger(outputsize)||outputsize<1||outputsize>5000)throw Error('Некорректный размер истории');
 const url=new URL('https://api.twelvedata.com/time_series');
 for(const [k,v] of Object.entries({symbol,interval:'1day',outputsize:String(outputsize),order:'DESC',adjust:'splits',apikey:apiKey}))url.searchParams.set(k,v);
 const res=await fetcher(url,{signal:AbortSignal.timeout(20000),redirect:'error'});
 if(!res.ok)throw Error('Поставщик данных: HTTP '+res.status);
 return normalizeDaily(await res.json());
}
