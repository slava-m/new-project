import {patternStateLabel} from './patterns.mjs';
const labels={candidate:'Условный кандидат',waiting:'Наблюдать: условия отбора не выполнены',excluded:'Исключён',insufficient:'Недостаточно данных'};
const number=value=>Number.isFinite(value)?value.toFixed(2):'нет данных';
export function validateAssessment(raw,signal){
 try{const value=JSON.parse(raw);return value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===1&&value.status===signal.status;}catch{return false;}
}
export function buildReport({symbol,bars,signal,modelConfirmed=false}){
 const last=bars.at(-1),f=signal.facts||{},p=signal.plan;
 const lines=[symbol+' · торговая дата: '+(last?new Date(last.time*1000).toISOString().slice(0,10):'нет данных'),
 'Статус: '+labels[signal.status],...signal.reasons.map(r=>'• '+r),
 '', 'Расчёты по завершённым дневным свечам:',
 'Закрытие: '+number(last?.close)+' · SMA20: '+number(f.sma20)+' · SMA50: '+number(f.sma50)+' · SMA150: '+number(f.sma150)+' · ATR14: '+number(f.atr14)];
 if(signal.patterns.length)lines.push('',...signal.patterns.map(x=>x.type+': '+(x.direction+' · '+patternStateLabel(x))+'. '+x.rule));
 if(signal.warnings?.length)lines.push('','Медвежьи предупреждения:',...signal.warnings);
 if(p)lines.push('','Условные уровни, сделка не исполнена:',
 'Вход: '+number(p.entry)+' · стоп: '+number(p.stop)+' · цель: '+number(p.target)+' · RR: '+number(p.execution?p.netRR:p.rr),
 'Опора: '+number(p.support.value)+'. '+p.supportReason,
 'Цель: '+p.targetReason,
 'Срок активации: '+p.validForSessions+' торговые сессии; проверка выхода по времени после '+p.maxHoldSessions+' торговых сессий: закрытие только при результате после издержек не ниже нуля.',
 p.execution?'RR после комиссии и проскальзывания: '+number(p.netRR)+'. Минимум 2:1; верхнего ограничения RR нет. Потенциальный риск: '+number(p.execution.netRisk)+' USD; потенциальная прибыль: '+number(p.execution.netReward)+' USD; количество акций в симуляции: '+p.execution.qty+'.':'RR рассчитан до комиссий и проскальзывания. Прибыль до цели должна быть минимум вдвое больше риска до стопа.');
 else lines.push('','Активного плана и уровней входа нет.');
 lines.push('','Возможные условия отмены, а не факты текущего состояния:',...signal.cancel.map(x=>'• '+x),'',...signal.limitations.map(x=>'• '+x),'',
 modelConfirmed?'Локальная модель подтвердила рассчитанный статус. Текст и уровни сформированы из проверяемых расчётов.':'Подтверждение модели не получено. Показан отчёт по расчётам, без свободного текста модели.');
 return lines.join('\n');
}
