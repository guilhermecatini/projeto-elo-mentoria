export const RAW_INDICATOR_KEYS = ['revenue','orders','visits','adSpend','attributedRevenue','totalCosts','claims','cancellations','lateShipments','skuCount','outOfStockSkus','activeListings','completeListings'] as const;
export type RawIndicatorKey = typeof RAW_INDICATOR_KEYS[number];
export type MetricUnit = 'BRL'|'count'|'percent'|'ratio';
export type GoalDirection = 'at_least'|'at_most';
const definition = (label:string,unit:MetricUnit,direction:GoalDirection,derived=false) => ({label,unit,direction,derived});
export const METRIC_DEFINITIONS = {
  revenue:definition('Faturamento de vendas','BRL','at_least'),
  orders:definition('Pedidos','count','at_least'), visits:definition('Visitas','count','at_least'),
  adSpend:definition('Investimento publicitário','BRL','at_most'), attributedRevenue:definition('Vendas atribuídas à publicidade','BRL','at_least'),
  totalCosts:definition('Custos totais','BRL','at_most'), claims:definition('Reclamações','count','at_most'),
  cancellations:definition('Cancelamentos','count','at_most'), lateShipments:definition('Envios atrasados','count','at_most'),
  skuCount:definition('SKUs no fim do período','count','at_least'), outOfStockSkus:definition('SKUs sem estoque no fim do período','count','at_most'),
  activeListings:definition('Anúncios ativos no fim do período','count','at_least'), completeListings:definition('Anúncios completos no fim do período','count','at_least'),
  averageTicket:definition('Ticket médio','BRL','at_least',true), conversionRate:definition('Conversão de pedidos por visita','percent','at_least',true),
  roas:definition('ROAS','ratio','at_least',true), acos:definition('ACOS','percent','at_most',true),
  tacos:definition('TACOS','percent','at_most',true), estimatedMargin:definition('Margem estimada','percent','at_least',true),
};
export type MetricKey = keyof typeof METRIC_DEFINITIONS;
export const INDICATOR_KEYS = Object.keys(METRIC_DEFINITIONS) as MetricKey[];
export type IndicatorValues = Record<RawIndicatorKey,string|number|null>;
export type IndicatorData = {periodStatus:'partial'|'closed';sourceLabel:string;notes?:string;
  basisConfirmed:boolean;adsAttributionConfirmed:boolean;costsComplete:boolean;values:IndicatorValues};
export type MetricMissingReason = 'missing_data'|'zero_denominator'|'basis_unconfirmed'|'attribution_unconfirmed'|'incomplete_costs';
export type MetricReading = {value:number|null;reason:MetricMissingReason|null;unit:MetricUnit};
export type IndicatorMetrics = Record<MetricKey,MetricReading>;
export type IndicatorPeriod = {period:string;data:IndicatorData|null};
const round = (value:number,digits=4) => Number(value.toFixed(digits));

// Monetary inputs are validated decimal strings. Work in cents before ratios to avoid summing binary fractions.
function readValue(value:string|number|null|undefined,unit:MetricUnit) {
  if (value == null || value === '') return null;
  if (unit === 'BRL') {
    const text=String(value);
    if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
    const [whole,fraction='']=text.split('.');
    const cents=Number(whole)*100+Number(fraction.padEnd(2,'0'));
    return Number.isSafeInteger(cents)?cents/100:null;
  }
  const number=Number(value);return Number.isFinite(number)?number:null;
}
export function computeIndicatorMetrics(data:IndicatorData):IndicatorMetrics {
  const output={} as IndicatorMetrics;
  for (const key of RAW_INDICATOR_KEYS) {
    const unit=METRIC_DEFINITIONS[key].unit,value=readValue(data.values[key],unit);
    output[key]={value,unit,reason:value===null?'missing_data':null};
  }
  function derived(key:MetricKey,numerator:RawIndicatorKey,denominator:RawIndicatorKey,scale:number,extra?:MetricMissingReason) {
    const a=output[numerator].value,b=output[denominator].value,unit=METRIC_DEFINITIONS[key].unit;
    const reason:MetricMissingReason|null=a===null||b===null?'missing_data':!data.basisConfirmed?'basis_unconfirmed':extra?extra:b===0?'zero_denominator':null;
    output[key]={unit,reason,value:reason?null:round(a!/b!*scale,unit==='BRL'?2:4)};
  }
  derived('averageTicket','revenue','orders',1);
  derived('conversionRate','orders','visits',100);
  derived('roas','attributedRevenue','adSpend',1,data.adsAttributionConfirmed?undefined:'attribution_unconfirmed');
  derived('acos','adSpend','attributedRevenue',100,data.adsAttributionConfirmed?undefined:'attribution_unconfirmed');
  derived('tacos','adSpend','revenue',100);
  const revenue=output.revenue.value,costs=output.totalCosts.value;
  const reason:MetricMissingReason|null=revenue===null||costs===null?'missing_data':!data.basisConfirmed?'basis_unconfirmed':!data.costsComplete?'incomplete_costs':revenue===0?'zero_denominator':null;
  output.estimatedMargin={unit:'percent',reason,value:reason?null:round((revenue!-costs!)/revenue!*100)};
  return output;
}
export function previousIndicatorMonth(period:string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error('Período mensal inválido.');
  const [year,month]=period.split('-').map(Number);
  return month===1?`${String(year-1).padStart(4,'0')}-12`:`${year}-${String(month-1).padStart(2,'0')}`;
}
export function indicatorMonths(from:string,to:string) {
  previousIndicatorMonth(from);previousIndicatorMonth(to);
  if(from>to)throw new Error('O início deve ser anterior ao fim.');
  const result:string[]=[];let cursor=to;
  while(cursor>=from){result.unshift(cursor);if(result.length>36)throw new Error('Consulte até 36 meses por vez.');cursor=previousIndicatorMonth(cursor);}
  return result;
}
export type IndicatorComparisonReason = 'missing_current_period'|'missing_previous_period'|'non_adjacent_periods'|'partial_period'|'source_changed'|'basis_unconfirmed';
export type IndicatorComparison = {comparable:boolean;reason:IndicatorComparisonReason|null;metrics:Record<MetricKey,{
  current:number|null;previous:number|null;absoluteChange:number|null;percentChange:number|null;reason:string|null}>};
function normalizedSource(value:string){return value.normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR');}
export function compareIndicatorPeriods(current:IndicatorPeriod,previous?:IndicatorPeriod):IndicatorComparison {
  const reason:IndicatorComparisonReason|null=!current.data?'missing_current_period':!previous?.data?'missing_previous_period'
    :previous.period!==previousIndicatorMonth(current.period)?'non_adjacent_periods'
    :current.data.periodStatus!=='closed'||previous.data.periodStatus!=='closed'?'partial_period'
    :normalizedSource(current.data.sourceLabel)!==normalizedSource(previous.data.sourceLabel)?'source_changed'
    :!current.data.basisConfirmed||!previous.data.basisConfirmed?'basis_unconfirmed':null;
  const a=current.data?computeIndicatorMetrics(current.data):null,b=previous?.data?computeIndicatorMetrics(previous.data):null;
  const metrics={} as IndicatorComparison['metrics'];
  for(const key of INDICATOR_KEYS){
    const currentValue=a?.[key].value??null,previousValue=b?.[key].value??null;
    const missing=reason||a?.[key].reason||b?.[key].reason||null;
    const absoluteChange=!missing&&currentValue!==null&&previousValue!==null?round(currentValue-previousValue):null;
    const isPercent=METRIC_DEFINITIONS[key].unit==='percent';
    metrics[key]={current:currentValue,previous:previousValue,absoluteChange,
      percentChange:absoluteChange!==null&&!isPercent&&previousValue!==0?round(absoluteChange/Math.abs(previousValue!)*100):null,
      reason:missing||(!isPercent&&previousValue===0?'zero_baseline':null)};
  }
  return {comparable:!reason,reason,metrics};
}
export type IndicatorGoalInput = {period:string;metricKey:MetricKey;target:string|number;direction:GoalDirection};
export function evaluateIndicatorGoal(goal:IndicatorGoalInput,point?:IndicatorPeriod) {
  const target=Number(goal.target);
  const reading=point?.period===goal.period&&point.data?computeIndicatorMetrics(point.data)[goal.metricKey]:null;
  const actual=reading?.value??null,currentlyMeets=actual===null?null:goal.direction==='at_least'?actual>=target:actual<=target;
  return {status:actual===null?'not_informed' as const:point!.data!.periodStatus==='partial'?'in_progress' as const:currentlyMeets?'achieved' as const:'not_achieved' as const,
    actual,target,difference:actual===null?null:round(actual-target),currentlyMeets,reason:reading?.reason||(actual===null?'missing_data':null)};
}
