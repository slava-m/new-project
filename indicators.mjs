export function indicators(bars,options={}) {
  if (bars.length < 2) return {count:bars.length,missing:["Нужно минимум две завершённые свечи"]};
  const last=bars.at(-1),prev=bars.at(-2);
  const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
  const sma20=bars.length>=20?mean(bars.slice(-20).map(b=>b.close)):null;
  let rsi14=null;
  if(bars.length>=15){let gain=0,loss=0;for(let i=bars.length-14;i<bars.length;i++){const d=bars[i].close-bars[i-1].close;gain+=Math.max(d,0);loss+=Math.max(-d,0);}rsi14=loss===0?(gain===0?50:100):100-100/(1+gain/loss);}
  const prior=bars.slice(-21,-1);
  const avgVol=prior.length===20&&prior.every(b=>b.volume!==null)?mean(prior.map(b=>b.volume)):null;
  return {count:bars.length,close:last.close,changePct:prev.close?100*(last.close/prev.close-1):null,
    sma20,rsi14,volume:last.volume,volumeRatio:avgVol>0&&last.volume!==null?last.volume/avgVol:null,
    gaps:bars.slice(-21).some((b,i,a)=>i>0&&b.time-a[i-1].time>(options.timeframe==='1day'?7*86400:60)),
    missing:[...(sma20===null?["SMA20: недостаточно свечей"]:[]),...(rsi14===null?["RSI14: недостаточно свечей"]:[]),...(avgVol===null?["Сравнение объёма: недостаточно данных"]:[]),"Новостей и фундаментальных данных нет; причины движения не установлены"]};
}
export function validBar(b) {return Number.isInteger(b.time)&&b.time>0&&[b.open,b.high,b.low,b.close].every(x=>Number.isFinite(x)&&x>0)&&b.high>=Math.max(b.open,b.close)&&b.low<=Math.min(b.open,b.close)&&b.high>=b.low;}
export function splitClosed(bars,now=Date.now()/1000) {return bars.filter(b=>b.time+60<=now);}
