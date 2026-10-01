import {pivots,fitLine} from './chart-math.mjs';
export const patternCatalogue=[
'Double Bottom','Double Top','Triple Bottom','Triple Top','Cup and Handle','Inverted Cup and Handle','Inverse Head and Shoulders','Head and Shoulders',
'Ascending Triangle','Descending Triangle','Symmetrical Triangle','Falling Wedge','Rising Wedge','Rectangle','Ascending Channel','Descending Channel',
'Bull Flag','Bear Flag','Bull Pennant','Bear Pennant','Rounding Bottom','Rounding Top',
'Bullish Engulfing','Bearish Engulfing','Hammer','Shooting Star','Morning Star','Evening Star','Piercing Line','Dark Cloud Cover','Bullish Harami','Bearish Harami','Inside Bar Breakout','Inside Bar Breakdown'];
export const patternStateLabel=p=>({forming:'формируется',breakout:'пробой вверх подтверждён',breakdown:'пробой вниз подтверждён',confirmed:'свечная модель подтверждена',invalidated:'структура отменена'}[p.state]||p.state);
function crossed(last,prev,level,direction){return direction==='bullish'?last>level&&prev<=level:last<level&&prev>=level;}
export function extraStructures(bars,atr){
 if(!Number.isFinite(atr)||atr<=0||bars.length<5)return [];
 const out=[],n=bars.length,last=bars.at(-1),prev=bars.at(-2),prior=bars.slice(0,-1),recentLow=pivots(bars).filter(p=>p.index>=n-75),recentHigh=pivots(bars,'high').filter(p=>p.index>=n-75);
 const add=p=>{if(!out.some(x=>x.type===p.type))out.push({...p,experimental:true});};
 for(const [kind,direction,points]of [['low','bullish',recentLow],['high','bearish',recentHigh]]){
 for(let j=points.length-1;j>=2;j--){
 const [a,b,c]=points.slice(j-2,j+1);if(c.index<n-20||b.index-a.index<5||c.index-b.index<5||c.index-a.index>60)continue;
 const prices=[a.value,b.value,c.value],flat=Math.max(...prices)-Math.min(...prices)<=0.5*atr,shoulders=Math.abs(a.value-c.value)<=atr,head=kind==='low'?Math.min(a.value,c.value)-b.value:b.value-Math.max(a.value,c.value);
 const between=(x,y)=>kind==='low'?Math.max(...bars.slice(x.index+1,y.index).map(p=>p.high)):Math.min(...bars.slice(x.index+1,y.index).map(p=>p.low));
 const first=between(a,b),second=between(b,c),neck=flat?(kind==='low'?Math.max(first,second):Math.min(first,second)):(first+second)/2;
 const depth=kind==='low'?neck-Math.min(...prices):Math.max(...prices)-neck;if(depth<atr||!flat&&(!shoulders||head<atr))continue;
 if(kind==='low'&&bars.slice(c.index+1).some(p=>p.low<c.value)||kind==='high'&&bars.slice(c.index+1).some(p=>p.high>c.value))continue;
 const type=flat?(kind==='low'?'Triple Bottom':'Triple Top'):(kind==='low'?'Inverse Head and Shoulders':'Head and Shoulders');
 add({type,category:'chart',direction,state:crossed(last.close,prev.close,neck,direction)?(direction==='bullish'?'breakout':'breakdown'):'forming',support:kind==='low'?c.value:null,resistance:kind==='high'?c.value:null,trigger:neck,target:neck+(direction==='bullish'?depth:-depth),points:[a,b,c],rule:flat?'Три подтверждённые точки, разброс ≤0.5 ATR, уровень между ними':'Три подтверждённые точки: голова глубже плеч ≥1 ATR, плечи различаются ≤1 ATR'});
 }
 }
 for(const span of [12,20,35,50]){
 const start=n-1-span;if(start<0)continue;const highs=pivots(bars,'high').filter(p=>p.index>=start),lows=pivots(bars).filter(p=>p.index>=start);
 if(highs.length<3||lows.length<3)continue;const u=fitLine(highs),l=fitLine(lows);if(!u||!l||u.error>0.4*atr||l.error>0.4*atr)continue;
 const width=u.at(start)-l.at(start),endWidth=u.at(n-1)-l.at(n-1),band=bars.slice(start,n-1);
 if(width<1.5*atr||width>12*atr||endWidth<0.25*atr||band.some((b,i)=>b.high>u.at(start+i)+0.6*atr||b.low<l.at(start+i)-0.6*atr))continue;
 const flatU=Math.abs(u.slope)<=0.02*atr,flatL=Math.abs(l.slope)<=0.02*atr,converging=endWidth<width*0.8,parallel=Math.abs(endWidth-width)<=0.3*atr;
 let type=null,direction='neutral';
 if(converging&&flatU&&l.slope>0.02*atr){type='Ascending Triangle';direction='bullish';}
 else if(converging&&flatL&&u.slope< -0.02*atr){type='Descending Triangle';direction='bearish';}
 else if(converging&&u.slope< -0.02*atr&&l.slope>0.02*atr)type='Symmetrical Triangle';
 else if(converging&&u.slope< -0.02*atr&&l.slope< -0.02*atr){type='Falling Wedge';direction='bullish';}
 else if(converging&&u.slope>0.02*atr&&l.slope>0.02*atr){type='Rising Wedge';direction='bearish';}
 else if(parallel&&flatU&&flatL)type='Rectangle';
 else if(parallel&&u.slope>0.02*atr&&l.slope>0.02*atr)type='Ascending Channel';
 else if(parallel&&u.slope< -0.02*atr&&l.slope< -0.02*atr)type='Descending Channel';
 if(!type)continue;
 const up=last.close>u.at(n-1)&&prev.close<=u.at(n-2),down=last.close<l.at(n-1)&&prev.close>=l.at(n-2);
 if(up)direction='bullish';if(down)direction='bearish';
 const trigger=direction==='bearish'?l.at(n-1):u.at(n-1),support=lows.at(-1).value;
 const common={category:'chart',direction,state:up?'breakout':down?'breakdown':'forming',support,resistance:highs.at(-1).value,trigger,target:trigger+(direction==='bearish'?-width:width),points:[...highs,...lows].sort((a,b)=>a.index-b.index),rule:'≥3 подтверждённых касаний каждой границы; погрешность линий ≤0.4 ATR; пробой только по закрытию'};
 add({type,...common});
 if(start>=9&&span<=20){
 const impulse=bars[start].close-bars[start-8].close,pole=Math.abs(impulse),poleDirection=impulse>0?'bullish':'bearish',flag=parallel&&((impulse>0&&u.slope<=0.02*atr&&l.slope<=0.02*atr)||(impulse<0&&u.slope>= -0.02*atr&&l.slope>= -0.02*atr)),pennant=type==='Symmetrical Triangle';
 const floor=Math.min(...band.map(b=>b.low)),ceiling=Math.max(...band.map(b=>b.high));
 const shallow=impulse>0?floor>=bars[start].close-pole*0.5:ceiling<=bars[start].close+pole*0.5;
 if(pole>=3*atr&&width<=pole*0.6&&shallow&&(flag||pennant)){
 const confirmed=impulse>0?up:down,wrong=impulse>0?down:up,level=impulse>0?u.at(n-1):l.at(n-1);
 add({...common,type:(impulse>0?'Bull ':'Bear ')+(pennant?'Pennant':'Flag'),direction:poleDirection,state:wrong?'invalidated':confirmed?(impulse>0?'breakout':'breakdown'):'forming',trigger:level,target:level+(impulse>0?pole:-pole),rule:'Импульс ≥3 ATR за 8 сессий; пауза 12–20 сессий; откат ≤половины импульса; подтверждённые границы'});
 }
 }
 }
 if(n>=35){
 const base=prior.slice(-30),left=base.slice(0,8),middle=base.slice(8,22),right=base.slice(22),mean=a=>a.reduce((s,b)=>s+b.close,0)/a.length;
 for(const direction of ['bullish','bearish']){
 const sign=direction==='bullish'?1:-1,a=mean(left)*sign,m=mean(middle)*sign,z=mean(right)*sign,extreme=direction==='bullish'?Math.min(...middle.map(b=>b.low)):Math.max(...middle.map(b=>b.high)),depth=Math.min(a,z)-m;
 if(depth<1.5*atr||Math.abs(a-z)>2*atr||right.at(-1).close*sign<=right[0].close*sign)continue;
 const bottomCount=middle.filter(b=>direction==='bullish'?b.low<=extreme+0.5*atr:b.high>=extreme-0.5*atr).length;if(bottomCount<3)continue;
 const level=direction==='bullish'?Math.max(...left.map(b=>b.high)):Math.min(...left.map(b=>b.low));
 add({type:direction==='bullish'?'Rounding Bottom':'Rounding Top',category:'chart',direction,state:crossed(last.close,prev.close,level,direction)?(direction==='bullish'?'breakout':'breakdown'):'forming',support:direction==='bullish'?Math.min(...right.map(b=>b.low)):null,resistance:direction==='bearish'?Math.max(...right.map(b=>b.high)):null,trigger:level,target:level+sign*Math.abs(level-extreme),points:[],rule:'30-сессионная округлая структура; глубина средних частей ≥1.5 ATR, ≥3 свечей у экстремума'});
 }
 }
 const body=b=>Math.abs(b.close-b.open),range=b=>b.high-b.low,bull=b=>b.close>b.open,bear=b=>b.close<b.open;
 const falling=bars[n-5].close>prev.close,rising=bars[n-5].close<prev.close;
 const candle=(type,direction,rule)=>add({type,category:'candle',direction,state:'confirmed',support:Math.min(last.low,prev.low),trigger:last.high,target:null,points:[],rule});
 if(falling&&bear(prev)&&bull(last)&&last.open<=prev.close&&last.close>=prev.open&&body(last)>=body(prev))candle('Bullish Engulfing','bullish','После снижения бычье тело полностью поглощает предыдущее медвежье');
 if(rising&&bull(prev)&&bear(last)&&last.open>=prev.close&&last.close<=prev.open&&body(last)>=body(prev))candle('Bearish Engulfing','bearish','После роста медвежье тело полностью поглощает предыдущее бычье');
 if(body(last)>0&&falling&&bull(last)&&Math.min(last.open,last.close)-last.low>=2*body(last)&&last.high-Math.max(last.open,last.close)<=0.3*body(last))candle('Hammer','bullish','После снижения нижняя тень ≥2 тел, верхняя ≤0.3 тела');
 if(body(last)>0&&rising&&bear(last)&&last.high-Math.max(last.open,last.close)>=2*body(last)&&Math.min(last.open,last.close)-last.low<=0.3*body(last))candle('Shooting Star','bearish','После роста верхняя тень ≥2 тел, нижняя ≤0.3 тела');
 const first=bars[n-3],mid=prev;
 if(falling&&bear(first)&&body(first)>=0.5*range(first)&&body(mid)<=0.3*range(first)&&bull(last)&&last.close>(first.open+first.close)/2)candle('Morning Star','bullish','Снижение, сильная медвежья свеча, малое тело, бычий возврат выше середины первой');
 if(rising&&bull(first)&&body(first)>=0.5*range(first)&&body(mid)<=0.3*range(first)&&bear(last)&&last.close<(first.open+first.close)/2)candle('Evening Star','bearish','Рост, сильная бычья свеча, малое тело, медвежий возврат ниже середины первой');
 if(falling&&bear(prev)&&bull(last)&&last.open<prev.close&&last.close>(prev.open+prev.close)/2&&last.close<prev.open)candle('Piercing Line','bullish','После снижения открытие ниже прошлого закрытия, возврат выше середины тела');
 if(rising&&bull(prev)&&bear(last)&&last.open>prev.close&&last.close<(prev.open+prev.close)/2&&last.close>prev.open)candle('Dark Cloud Cover','bearish','После роста открытие выше прошлого закрытия, возврат ниже середины тела');
 if(body(prev)>0&&body(last)<=0.6*body(prev)&&Math.min(last.open,last.close)>=Math.min(prev.open,prev.close)&&Math.max(last.open,last.close)<=Math.max(prev.open,prev.close)){
 if(falling&&bear(prev)&&bull(last))candle('Bullish Harami','bullish','После снижения малое бычье тело внутри предыдущего медвежьего');
 if(rising&&bull(prev)&&bear(last))candle('Bearish Harami','bearish','После роста малое медвежье тело внутри предыдущего бычьего');
 }
 if(prev.high<first.high&&prev.low>first.low){
 if(last.close>first.high&&prev.close<=first.high)candle('Inside Bar Breakout','bullish','Внутренняя свеча; закрытие выше максимума материнской свечи');
 if(last.close<first.low&&prev.close>=first.low)candle('Inside Bar Breakdown','bearish','Внутренняя свеча; закрытие ниже минимума материнской свечи');
 }
 return out;
}
