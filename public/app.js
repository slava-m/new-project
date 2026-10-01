const $=id=>document.getElementById(id);let state,selected,chartSource='tv',widgetSymbol='',chartKey='',fitted=false,widgetFailed=false;
const fmt=(v,n=2)=>Number.isFinite(v)?v.toLocaleString('ru-RU',{maximumFractionDigits:n}):'—';
const day=t=>t?new Date(t*1000).toISOString().slice(0,10):'—';
const date=t=>t?new Date(t).toLocaleString('ru-RU',{timeZone:'Asia/Jerusalem'}):'—';
const labels={candidate:'Условный кандидат',waiting:'Наблюдать',excluded:'Исключён',insufficient:'Недостаточно данных'};
function el(tag,value,cls){const node=document.createElement(tag);node.textContent=value;if(cls)node.className=cls;return node;}
function fact(host,name,value){const box=el('div',name,'fact');box.append(el('b',value));host.append(box);}
const chart=LightweightCharts.createChart($('chart'),{autoSize:true,layout:{background:{color:'#111b2a'},textColor:'#8da0bb',attributionLogo:true},grid:{vertLines:{color:'#1c2a3f'},horzLines:{color:'#1c2a3f'}},timeScale:{timeVisible:false},localization:{locale:'ru-RU'}});
const candles=chart.addSeries(LightweightCharts.CandlestickSeries,{upColor:'#66cdb0',downColor:'#ef7c81',borderVisible:false,wickUpColor:'#66cdb0',wickDownColor:'#ef7c81'});
const volume=chart.addSeries(LightweightCharts.HistogramSeries,{priceFormat:{type:'volume'},priceScaleId:'volume'});
volume.priceScale().applyOptions({scaleMargins:{top:0.8,bottom:0}});candles.priceScale().applyOptions({scaleMargins:{top:0.08,bottom:0.25}});
function selectSymbol(s){selected=s;fitted=false;chartKey='';render();}
function widget(){
 const symbol='NASDAQ:'+selected;if(widgetSymbol===symbol)return;widgetSymbol=symbol;widgetFailed=false;
 const host=$('tv-chart');host.replaceChildren();const target=document.createElement('div');target.className='tradingview-widget-container__widget';host.append(target);
 const iframe=document.createElement('iframe');iframe.title='Дневной график TradingView';iframe.style.cssText='width:100%;height:100%;border:0';
 iframe.src='https://www.tradingview-widget.com/embed-widget/advanced-chart/?locale=ru#'+encodeURIComponent(JSON.stringify({autosize:true,symbol,interval:'D',timezone:'Asia/Jerusalem',theme:'dark',style:'1',locale:'ru',allow_symbol_change:false,width:'100%',height:'100%',support_host:'https://www.tradingview.com'}));host.replaceChildren(iframe);
}
$('chart-source').onchange=e=>{chartSource=e.target.value;render();};
function render(){
 if(!state)return;const s=state;if(!s.symbols[selected])selected=Object.keys(s.symbols)[0];const v=s.symbols[selected],signal=v.signal;if(!v)return;
 $('connection').textContent=s.daily.status==='ready'?'Дневная история подключена':s.daily.status==='loading'?'Загружается дневная история':'Дневной источник требует настройки';
 const counts={};for(const x of Object.values(s.symbols))counts[x.signal.status]=(counts[x.signal.status]||0)+1;
 $('scan-summary').textContent='Проверяется '+Object.keys(s.symbols).length+' акций · кандидатов: '+(counts.candidate||0)+' · наблюдать: '+(counts.waiting||0)+' · исключено: '+(counts.excluded||0)+' · без данных: '+(counts.insufficient||0);
 $('universe-note').textContent=s.universe.name+'. '+s.universe.note;
 const table=document.createElement('table');const head=document.createElement('tr');for(const name of ['Акция','Статус','Дата данных','Причина'])head.append(el('th',name));table.append(head);
 for(const [symbol,x] of Object.entries(s.symbols)){const tr=document.createElement('tr');tr.tabIndex=0;tr.className='scan-row';tr.onclick=()=>selectSymbol(symbol);tr.onkeydown=e=>{if(e.key==='Enter')selectSymbol(symbol);};tr.append(el('td',symbol),el('td',labels[x.signal.status]),el('td',day(x.bars.at(-1)?.time)),el('td',x.signal.reasons[0]||'—'));table.append(tr);}
 $('scan-table').replaceChildren(table);
 $('watch').replaceChildren();for(const [symbol,x] of Object.entries(s.symbols)){const button=el('button','','watch'+(selected===symbol?' active':''));const left=document.createElement('div');left.append(el('strong',symbol),el('div',labels[x.signal.status],'muted'));button.append(left,el('span',x.bars.length?fmt(x.bars.at(-1).close):'—'));button.onclick=()=>selectSymbol(symbol);$('watch').append(button);}

 const histories=Object.entries(s.symbols).filter(([,x])=>x.history);
 const allTable=document.createElement('table'),historyHead=document.createElement('tr');
 for(const title of ['Акция','Свечи','Сигналы','Отмены входа','Сделки'])historyHead.append(el('th',title));allTable.append(historyHead);
 let totalSignals=0,totalTrades=0;
 for(const [symbol,x] of histories){const h=x.history,row=document.createElement('tr');row.className='scan-row';row.tabIndex=0;row.onclick=()=>selectSymbol(symbol);row.onkeydown=e=>{if(e.key==='Enter')selectSymbol(symbol);};for(const value of [symbol,h.coverage.bars,h.signals,h.skipped+h.expired,h.metrics.closedTrades])row.append(el('td',String(value)));allTable.append(row);totalSignals+=h.signals;totalTrades+=h.metrics.closedTrades;}
 $('universe-history').replaceChildren(allTable);
 $('universe-history-summary').textContent='Проверено акций: '+histories.length+' · сигналов: '+totalSignals+' · завершённых сделок: '+totalTrades+'. Каждая акция моделируется отдельно; это не общий портфель. Нажмите строку для деталей.';
 $('symbol').textContent=selected+' / USD';$('feed').textContent=chartSource==='tv'?'TradingView · задержка определяется источником':'Дневные свечи · не live';
 $('tv-chart').hidden=chartSource!=='tv';$('chart').hidden=chartSource!=='local'||!v.bars.length;$('chart-empty').hidden=chartSource!=='local'||!!v.bars.length;
 $('source-note').textContent=widgetFailed?'TradingView не загрузился; проверьте интернет.':chartSource==='tv'?'Публичный дневной график через интернет. Числовая история и агент получают данные отдельно.':'История из Twelve Data. Последний незавершённый торговый день исключён.';
 if(chartSource==='tv')widget();
 $('empty-reason').textContent=s.daily.message;
 const last=v.bars.at(-1),key=selected+':'+v.bars.length+':'+JSON.stringify(last);
 if(chartKey!==key){candles.setData(v.bars.map(({time,open,high,low,close})=>({time,open,high,low,close})));volume.setData(v.bars.filter(b=>b.volume!==null).map(b=>({time:b.time,value:b.volume,color:b.close>=b.open?'#377f71':'#884d5c'})));if(v.bars.length&&!fitted){chart.timeScale().fitContent();fitted=true;}chartKey=key;}
 $('freshness').textContent='Данные для расчётов: '+v.barMode+' · '+v.bars.length+' свечей · последняя торговая дата: '+day(last?.time)+' · получены: '+date(v.lastUpdate)+(v.barStale?' · нет свежей истории':'');
 $('signal-status').textContent=labels[signal.status];$('signal-method').textContent=signal.method+' · дата расчёта по свечам: '+day(last?.time);
 $('signal-reasons').replaceChildren(...signal.reasons.map(r=>el('p',r,'muted')));
 $('supported-patterns').textContent='Поддерживаются '+signal.supportedPatterns.length+' моделей: '+signal.supportedPatterns.join(', ');
 $('pattern-warnings').replaceChildren(...signal.warnings.map(r=>el('p',r,'muted')));
 $('patterns').replaceChildren(...signal.patterns.map(p=>el('p',p.type+' · '+(({forming:'предварительная структура',breakout:'пробой вверх',breakdown:'пробой вниз',confirmed:'свечная модель подтверждена',invalidated:'отменена'})[p.state]+' · '+p.direction)+' · '+p.rule,'muted')));
 $('facts').replaceChildren();for(const [label,name] of [['SMA20','sma20'],['SMA50','sma50'],['SMA150','sma150'],['ATR14 (Wilder)','atr14']])fact($('facts'),label,fmt(signal.facts?.[name]));
 $('plan').replaceChildren();if(signal.plan){for(const [label,name] of [['Условный вход','entry'],['Стоп по структуре','stop'],['Расчётная цель','target'],['RR до издержек','rr'],['Минимальная цель для 2:1','minimumTarget']])fact($('plan'),label,fmt(signal.plan[name]));$('plan').append(el('p',signal.plan.supportReason+' · '+signal.plan.targetReason+' · действует '+signal.plan.validForSessions+' сессии · максимальное удержание '+signal.plan.maxHoldSessions+' сессий','muted'));}
 $('signal-cancel').textContent='Отмена: '+signal.cancel.join('; ');$('limitations').textContent=signal.limitations.join(' · ');
 const h=v.history;
 if(h){
 $('history-summary').textContent='Отдельная симуляция '+selected+' · '+h.coverage.bars+' свечей · '+h.coverage.decisionSessions+' сессий после прогрева · сигналов: '+h.signals+' · завершённых сделок: '+h.metrics.closedTrades;
 $('history-settings').textContent='Эксперимент: капитал '+fmt(h.settings.initialCapital)+' USD на каждую акцию отдельно · риск '+fmt(h.settings.riskFraction*100)+'% · комиссия '+fmt(h.settings.commissionPerSide)+' USD за покупку и за продажу · проскальзывание '+fmt(h.settings.slippageBps/100)+'% на каждую сторону.';
 $('history-metrics').replaceChildren();for(const [label,value] of [['Результат завершённых, USD',h.metrics.realizedNet],['Доходность завершённых, %',h.metrics.closedTrades?h.metrics.realizedReturnPct:null],['Прибыльных сделок, %',h.metrics.winRate],['Просадка по дневной оценке, %',h.metrics.maxDrawdownPct],['Средний результат, R',h.metrics.meanR]])fact($('history-metrics'),label,fmt(value));
 $('history-note').textContent='Незавершённых позиций: '+(h.openPosition?1:0)+' · ожидающих планов: '+(h.pendingPlan?1:0)+' · пропущено: '+h.skipped+' · истекло: '+h.expired+' · дней с неопределённым порядком стоп/цель: '+h.ambiguous+'. '+h.limitations.join(' · ');
 const table=document.createElement('table'),head=document.createElement('tr');for(const label of ['Вход / выход','Вход → выход, USD','Результат, USD','Причина выхода'])head.append(el('th',label));table.append(head);
 for(const t of h.trades.slice(-10)){const row=document.createElement('tr');row.append(el('td',day(t.entryTime)+' / '+day(t.exitTime)),el('td',fmt(t.entry)+' → '+fmt(t.exit)),el('td',fmt(t.net)),el('td',t.exitReason));table.append(row);}
 if(!h.trades.length)$('history-trades').textContent='Завершённых сделок нет: статистика прибыльности не рассчитана.';else $('history-trades').replaceChildren(table);
 }

 $('agent-status').textContent=s.agent.status==='ready'&&!v.bars.length?'Модель готова · ожидает историю':s.agent.message;
 $('analysis').textContent=v.analysis?.text||'Агент объяснит результаты после загрузки дневной истории. Сейчас расчётные уровни не подставляются.';
 $('analysis-time').textContent=v.analysis?'Анализ сформирован: '+date(v.analysis.generated)+' · исходная торговая дата: '+day(v.analysis.barStart):'';
 $('diagnostics').textContent=s.daily.message+' · модель: '+s.agent.model;$('errors').replaceChildren(...s.errors.slice(0,3).map(e=>el('p',date(e.at)+' · '+e.message)));
}
const events=new EventSource('/events');events.onmessage=e=>{state=JSON.parse(e.data);render();};events.onerror=()=>{$('connection').textContent='Нет связи с локальным сервером; экран может быть устаревшим';};

document.querySelectorAll('.setup-link').forEach(link=>link.onclick=e=>{e.preventDefault();const block=$('source-settings');block.open=true;if(!$('settings-frame').src)$('settings-frame').src='/settings';block.scrollIntoView({behavior:'smooth',block:'start'});});
