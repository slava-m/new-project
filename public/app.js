import {initChat} from '/chat.js';
import {translateDOM,validLanguage} from '/i18n.js';
import {matchesFilter,readPreferences,savePreferences} from '/filters.js';
const preferences=readPreferences(localStorage);let language=preferences.language;
const $=id=>document.getElementById(id);let listRequested=false;let state,selected,chartSource='tv',chartInterval='1day',widgetSymbol='',chartKey='',fitted=false,widgetFailed=false;
const fmt=(v,n=2)=>Number.isFinite(v)?v.toLocaleString(language==='en'?'en-US':'ru-RU',{maximumFractionDigits:n}):'—';
const day=t=>t?new Date(t*1000).toISOString().slice(0,10):'—';
const date=t=>t?new Date(t).toLocaleString(language==='en'?'en-GB':'ru-RU',{timeZone:'Asia/Jerusalem'}):'—';
const labels={candidate:'Условный кандидат',waiting:'Наблюдать',excluded:'Исключён',insufficient:'Недостаточно данных'};
function el(tag,value,cls){const node=document.createElement(tag);node.textContent=value;if(cls)node.className=cls;return node;}
function fact(host,name,value){const box=el('div',name,'fact');box.append(el('b',value));host.append(box);}
const chart=LightweightCharts.createChart($('chart'),{autoSize:true,layout:{background:{color:'#111b2a'},textColor:'#8da0bb',attributionLogo:true},grid:{vertLines:{color:'#1c2a3f'},horzLines:{color:'#1c2a3f'}},timeScale:{timeVisible:false},localization:{locale:language==='en'?'en-US':'ru-RU'}});
const candles=chart.addSeries(LightweightCharts.CandlestickSeries,{upColor:'#66cdb0',downColor:'#ef7c81',borderVisible:false,wickUpColor:'#66cdb0',wickDownColor:'#ef7c81'});
const volume=chart.addSeries(LightweightCharts.HistogramSeries,{priceFormat:{type:'volume'},priceScaleId:'volume'});
volume.priceScale().applyOptions({scaleMargins:{top:0.8,bottom:0}});candles.priceScale().applyOptions({scaleMargins:{top:0.08,bottom:0.25}});
function selectSymbol(s){selected=s;fitted=false;chartKey='';openEvents(s);}
function widget(){
 const symbol=(state.universe.members?.find(m=>m.symbol===selected)?.exchange||'NASDAQ')+':'+selected.replace('.', '-');const widgetKey=symbol+':'+language+':'+chartInterval;if(widgetSymbol===widgetKey)return;widgetSymbol=widgetKey;widgetFailed=false;
 const host=$('tv-chart');host.replaceChildren();const target=document.createElement('div');target.className='tradingview-widget-container__widget';host.append(target);
 const iframe=document.createElement('iframe');iframe.title='Дневной график TradingView';iframe.style.cssText='width:100%;height:100%;border:0';
 iframe.src='https://www.tradingview-widget.com/embed-widget/advanced-chart/?locale='+language+'#'+encodeURIComponent(JSON.stringify({autosize:true,symbol,interval:chartInterval==='1min'?'1':'D',timezone:'Asia/Jerusalem',theme:'dark',style:'1',locale:language,allow_symbol_change:false,width:'100%',height:'100%',support_host:'https://www.tradingview.com'}));host.replaceChildren(iframe);
}
$('chart-source').onchange=e=>{chartSource=e.target.value;render();};
$('chart-interval').onchange=e=>{chartInterval=e.target.value;chartSource='local';$('chart-source').value='local';fitted=false;chartKey='';chart.applyOptions({timeScale:{timeVisible:chartInterval==='1min'}});openEvents(selected);render();};
function render(){
 if(!state)return;const s=state;if(!s.symbols[selected])selected=Object.keys(s.symbols)[0];const v=s.symbols[selected],signal=v.signal;if(!v)return;
 $('source-status').textContent=s.archive?.sources?.twelvedata?.configured?'Резервный ключ Twelve Data уже сохранён. Повторный ввод не требуется.':'Резервный ключ Twelve Data не настроен. Yahoo работает без ключа.';
 $('connection').textContent=s.daily.status==='ready'?'Дневная история подключена':s.daily.status==='loading'?'Загружается дневная история':s.daily.status==='paused'?'Очередь ожидает лимит':'Дневной источник требует настройки';
 const counts={};for(const x of Object.values(s.symbols))counts[x.signal.status]=(counts[x.signal.status]||0)+1;
 const search=$('scan-search').value.trim().toUpperCase(),filters={search,status:$('scan-status').value,hideBelow:$('hide-below-sma').checked};
 const shown=Object.entries(s.symbols).filter(([symbol,row])=>matchesFilter(symbol,row,filters));
 const showList=Boolean(search)||listRequested;
 $('show-all-stocks').textContent=showList?'Скрыть список':'Показать все акции';$('scan-table').hidden=!showList;$('scan-prompt').hidden=showList;$('scan-empty').hidden=!showList||shown.length>0;
 $('selection-filter-note').hidden=matchesFilter(selected,v,filters);
 $('archive-progress').textContent=s.archive?'Архив: '+s.archive.loaded+' / '+s.archive.total+' акций · осталось загрузить: '+s.archive.pending+' · историческая симуляция готова: '+s.archive.simulated+' · запросов приложения сегодня: '+s.archive.requestsToday+' / '+s.archive.dailyBudget+'. '+s.daily.message+' · Yahoo: '+s.archive.sources.yahoo.used+' запросов без ключа · Twelve Data: '+s.archive.sources.twelvedata.used+' запросов':'';
 $('analysis-schedule').textContent=s.analysisSchedule?'Повторный анализ каждые '+s.analysisSchedule.intervalMinutes+' минут · отчётов обновлено: '+s.analysisSchedule.reviewed+' / '+s.analysisSchedule.total+' · в очереди: '+s.analysisSchedule.pending+' · последний запуск: '+date(s.analysisSchedule.lastStarted)+' · следующий запуск: '+date(s.analysisSchedule.nextRun):'';
 $('scan-summary').textContent='Проверяется '+Object.keys(s.symbols).length+' акций · кандидатов: '+(counts.candidate||0)+' · наблюдать: '+(counts.waiting||0)+' · исключено: '+(counts.excluded||0)+' · без данных: '+(counts.insufficient||0)+' · Показано: '+shown.length+' из '+Object.keys(s.symbols).length;
 $('universe-note').textContent=s.universe.name+'. '+s.universe.note;
 const table=document.createElement('table');const head=document.createElement('tr');for(const name of ['Акция','Статус','Дата данных','Причина'])head.append(el('th',name));table.append(head);
 for(const [symbol,x] of Object.entries(s.symbols)){if(!matchesFilter(symbol,x,filters))continue;const tr=document.createElement('tr');tr.tabIndex=0;tr.className='scan-row';tr.onclick=()=>selectSymbol(symbol);tr.onkeydown=e=>{if(e.key==='Enter')selectSymbol(symbol);};tr.append(el('td',symbol),el('td',labels[x.signal.status]),el('td',day(x.bars.at(-1)?.time)),el('td',x.signal.reasons[0]||'—'));table.append(tr);}
 $('scan-table').replaceChildren(table);
 const navigation=showList?shown:[[selected,v]];
 $('sidebar-summary').textContent=showList?'Показано: '+shown.length:'Выбранная акция';
 $('watch').replaceChildren();for(const [symbol,x] of navigation){const button=el('button','','watch'+(selected===symbol?' active':''));const left=document.createElement('div');left.append(el('strong',symbol),el('div',labels[x.signal.status],'muted'));button.append(left,el('span',x.bars.length?fmt(x.bars.at(-1).close):'—'));button.onclick=()=>selectSymbol(symbol);$('watch').append(button);}

 const historySearch=$('history-search').value.trim().toUpperCase(),historyFilter=$('history-filter').value;
 const histories=Object.entries(s.symbols).filter(([symbol,x])=>x.history&&symbol.includes(historySearch)&&(historyFilter==='all'||(historyFilter==='signals'?x.history.signals>0:x.history.metrics.closedTrades>0)));
 $('history-empty').hidden=histories.length>0;
 const allTable=document.createElement('table'),historyHead=document.createElement('tr');
 for(const title of ['Акция','Свечи','Сигналы','Отмены входа','Сделки'])historyHead.append(el('th',title));allTable.append(historyHead);
 let totalSignals=0,totalTrades=0;
 for(const [symbol,x] of histories){const h=x.history,row=document.createElement('tr');row.className='scan-row';row.tabIndex=0;row.onclick=()=>selectSymbol(symbol);row.onkeydown=e=>{if(e.key==='Enter')selectSymbol(symbol);};for(const value of [symbol,h.coverage.bars,h.signals,h.skipped+h.expired,h.metrics.closedTrades])row.append(el('td',String(value)));allTable.append(row);totalSignals+=h.signals;totalTrades+=h.metrics.closedTrades;}
 $('universe-history').replaceChildren(allTable);
 $('universe-history-summary').textContent='Проверено акций: '+histories.length+' из '+Object.keys(s.symbols).length+' · сигналов: '+totalSignals+' · завершённых сделок: '+totalTrades+'. Каждая акция моделируется отдельно; это не общий портфель. Нажмите строку для деталей.';
 const minute=chartInterval==='1min',chartBars=minute?(s.minute?.bars||[]):v.bars;
 $('minute-note').hidden=!minute;$('minute-timezone').hidden=!minute||chartSource!=='local';$('minute-status').hidden=!minute;
 $('minute-status').textContent=s.intraday?'Минутный архив: '+s.intraday.loaded+' / '+s.intraday.total+' · очередь: '+s.intraday.pending+' · общий бюджет Yahoo: '+s.intraday.requestsToday+' / '+s.intraday.dailyBudget+' · следующая проверка: '+(s.intraday.running?'выполняется':date(s.intraday.nextCheckAt))+' · режим очереди: '+s.intraday.status:'';
 $('symbol').textContent=selected+' / USD';$('feed').textContent=chartSource==='tv'?'TradingView · задержка определяется источником':(minute?'Минутные свечи · не гарантированный live':'Дневные свечи · не live');
 $('tv-chart').hidden=chartSource!=='tv';$('chart').hidden=chartSource!=='local'||!chartBars.length;$('chart-empty').hidden=chartSource!=='local'||!!chartBars.length;
 $('source-note').textContent=minute?'Источник минутного архива: Yahoo Finance · завершённые свечи регулярной сессии · выбранная акция проверяется не чаще раза в 5 минут, остальные — по очереди и бюджету.':widgetFailed?'TradingView не загрузился; проверьте интернет.':chartSource==='tv'?'Публичный график TradingView. Числовая история для агента: '+(v.dataProvider?v.barMode:'ожидается загрузка')+'.':'Источник: '+(v.barMode||'ожидается')+'. Последний незавершённый торговый день исключён.';
 if(chartSource==='tv')widget();
 $('chart-empty').querySelector('h3').textContent=minute?'Минутная история ещё не получена':'Дневная история ещё не получена';
 $('chart-source').querySelector('option[value=local]').textContent=minute?'Минутная история · локально':'Дневная история · локально';
 $('empty-reason').textContent=minute?(s.minute?.error||'Ожидание минутного архива в пределах общего бюджета Yahoo.'):s.daily.message;
 const last=chartBars.at(-1),key=selected+':'+chartInterval+':'+chartBars.length+':'+JSON.stringify(last);
 if(chartKey!==key){candles.setData(chartBars.map(({time,open,high,low,close})=>({time,open,high,low,close})));volume.setData(chartBars.filter(b=>b.volume!==null).map(b=>({time:b.time,value:b.volume,color:b.close>=b.open?'#377f71':'#884d5c'})));if(chartBars.length&&!fitted){chart.timeScale().fitContent();fitted=true;}chartKey=key;}
 $('freshness').textContent=minute?'Yahoo Finance · 1 min · '+chartBars.length+' свечей на графике · всего в архиве: '+(s.minute?.totalBars||0)+' · последняя завершённая свеча: '+date(s.minute?.lastBarAt)+' · получено: '+date(s.minute?.fetchedAt)+' · возраст свечи, минут: '+fmt(s.minute?.ageMinutes,1)+(s.minute?.error?' · '+s.minute.error:''):'Данные для расчётов: '+v.barMode+' · '+v.bars.length+' свечей · последняя торговая дата: '+day(v.bars.at(-1)?.time)+' · получены: '+date(v.lastUpdate)+(v.barStale?' · нет свежей истории':'');
 $('signal-status').textContent=labels[signal.status];$('signal-method').textContent=signal.method+' · дата расчёта по свечам: '+day(v.bars.at(-1)?.time);
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
 }else{ $('history-summary').textContent='Ожидается загрузка истории или фоновая симуляция '+selected; $('history-settings').textContent=''; $('history-metrics').replaceChildren(); $('history-trades').replaceChildren(); $('history-note').textContent='Нет рассчитанной статистики для этой акции.';}

 $('agent-status').textContent=s.agent.status==='ready'&&!v.bars.length?'Модель готова · ожидает историю':s.agent.message;
 $('analysis').textContent=v.analysis?.text||'Агент объяснит результаты после загрузки дневной истории. Сейчас расчётные уровни не подставляются.';
 $('analysis-time').textContent=v.analysis?'Анализ сформирован: '+date(v.analysis.generated)+' · исходная торговая дата: '+day(v.analysis.barStart):'';
 $('diagnostics').textContent=s.daily.message+' · '+(s.daily.checking?'Проверка источника выполняется сейчас':'Следующая проверка источника: '+date(s.daily.nextCheckAt))+' · следующий анализ: '+date(s.analysisSchedule?.nextRun)+' · время Иерусалима · модель: '+s.agent.model;$('errors').replaceChildren(...s.errors.slice(0,3).map(e=>el('p',date(e.at)+' · '+e.message)));
 translateDOM(document.body,language);
}
let events;function openEvents(symbol){events?.close();events=new EventSource('/events'+(symbol?'?symbol='+encodeURIComponent(symbol)+'&interval='+chartInterval:''));events.onmessage=e=>{state=JSON.parse(e.data);render();};events.onerror=()=>{$('connection').textContent='Нет связи с локальным сервером; экран может быть устаревшим';};}openEvents();$('scan-search').oninput=()=>render();

document.querySelectorAll('.setup-link').forEach(link=>link.onclick=e=>{e.preventDefault();const block=$('source-settings');block.open=true;block.scrollIntoView({behavior:'smooth',block:'start'});});

$('change-provider-key').onclick=()=>{const frame=$('settings-frame');frame.hidden=!frame.hidden;if(!frame.hidden&&!frame.getAttribute('src'))frame.src='/settings?lang='+language;};
$('ui-language').value=language;$('scan-status').value=preferences.status;$('hide-below-sma').checked=preferences.hideBelow;
function storeUI(){savePreferences(localStorage,{language,status:$('scan-status').value,hideBelow:$('hide-below-sma').checked});}
$('ui-language').onchange=e=>{language=validLanguage(e.target.value);document.documentElement.lang=language;storeUI();chart.applyOptions({localization:{locale:language==='en'?'en-US':'ru-RU'}});$('settings-frame').contentWindow?.postMessage({type:'ui-language',language},location.origin);if(state)render();else translateDOM(document.body,language);};
$('scan-status').onchange=()=>{listRequested=true;if($('scan-status').value==='belowSma150')$('hide-below-sma').checked=false;storeUI();render();};
$('hide-below-sma').onchange=()=>{listRequested=true;if($('hide-below-sma').checked&&$('scan-status').value==='belowSma150')$('scan-status').value='all';storeUI();render();};
document.documentElement.lang=language;translateDOM(document.body,language);

initChat({getSymbol:()=>selected,getLanguage:()=>language});

$('show-all-stocks').onclick=()=>{listRequested=!(Boolean($('scan-search').value.trim())||listRequested);$('scan-status').value='all';$('hide-below-sma').checked=false;$('scan-search').value='';storeUI();render();};
$('history-filter').onchange=()=>render();$('history-search').oninput=()=>render();
