import test from 'node:test';
import assert from 'node:assert/strict';
import {computeIndicatorMetrics,compareIndicatorPeriods,evaluateIndicatorGoal,indicatorMonths,previousIndicatorMonth,RAW_INDICATOR_KEYS,type IndicatorData} from '../src/indicator-math';
const sample=(overrides:Partial<IndicatorData>={}):IndicatorData=>({periodStatus:'closed',sourceLabel:'Relatório consolidado',basisConfirmed:true,adsAttributionConfirmed:true,costsComplete:true,
  values:{...Object.fromEntries(RAW_INDICATOR_KEYS.map(k=>[k,null])),revenue:'1000.00',orders:10,visits:100,adSpend:'100.00',attributedRevenue:'600.00',totalCosts:'800.00'} as IndicatorData['values'],...overrides});
test('fórmulas usam os totais do mesmo período e os percentuais têm unidade explícita',()=>{
  const m=computeIndicatorMetrics(sample());assert.equal(m.averageTicket.value,100);assert.equal(m.conversionRate.value,10);
  assert.equal(m.roas.value,6);assert.equal(m.acos.value,16.6667);assert.equal(m.tacos.value,10);assert.equal(m.estimatedMargin.value,20);
  assert.equal(m.roas.unit,'ratio');assert.equal(m.conversionRate.unit,'percent');
});
test('dados ausentes são null e zero explícito permanece zero',()=>{
  const d=sample();d.values.revenue='0.00';d.values.claims=0;d.values.visits=null;
  const m=computeIndicatorMetrics(d);assert.equal(m.revenue.value,0);assert.equal(m.claims.value,0);assert.equal(m.visits.value,null);
  assert.equal(m.averageTicket.value,0);assert.equal(m.conversionRate.reason,'missing_data');assert.equal(m.tacos.reason,'zero_denominator');
});
test('denominadores zero não produzem infinito ou zero inventado',()=>{
  const d=sample();d.values.orders=0;d.values.adSpend='0.00';d.values.attributedRevenue='0.00';
  const m=computeIndicatorMetrics(d);for(const k of ['averageTicket','roas','acos'] as const){assert.equal(m[k].value,null);assert.equal(m[k].reason,'zero_denominator');}
});
test('confirmação de base, atribuição e custos limita os derivados sem apagar valores brutos',()=>{
  const noBasis=computeIndicatorMetrics(sample({basisConfirmed:false}));assert.equal(noBasis.revenue.value,1000);assert.equal(noBasis.averageTicket.reason,'basis_unconfirmed');
  const noAds=computeIndicatorMetrics(sample({adsAttributionConfirmed:false}));assert.equal(noAds.roas.reason,'attribution_unconfirmed');assert.equal(noAds.tacos.value,10);
  assert.equal(computeIndicatorMetrics(sample({costsComplete:false})).estimatedMargin.reason,'incomplete_costs');
});
test('margem negativa é preservada e os custos não são subtraídos duas vezes',()=>{
  const d=sample();d.values.totalCosts='1200.00';assert.equal(computeIndicatorMetrics(d).estimatedMargin.value,-20);
  d.values.revenue='0.30';d.values.totalCosts='0.10';assert.equal(computeIndicatorMetrics(d).estimatedMargin.value,66.6667);
});
test('comparação mensal só aceita meses adjacentes completos da mesma origem e base',()=>{
  const current={period:'2026-10',data:sample()},previous={period:'2026-09',data:sample()};
  assert.equal(compareIndicatorPeriods(current,previous).comparable,true);
  assert.equal(compareIndicatorPeriods(current,{...previous,period:'2026-08'}).reason,'non_adjacent_periods');
  assert.equal(compareIndicatorPeriods(current,{...previous,data:null}).reason,'missing_previous_period');
  assert.equal(compareIndicatorPeriods({...current,data:sample({periodStatus:'partial'})},previous).reason,'partial_period');
  assert.equal(compareIndicatorPeriods(current,{...previous,data:sample({sourceLabel:'Outra base'})}).reason,'source_changed');
  assert.equal(compareIndicatorPeriods(current,{...previous,data:sample({basisConfirmed:false})}).reason,'basis_unconfirmed');
  assert.equal(compareIndicatorPeriods(current,{...previous,data:sample({sourceLabel:'  RELATÓRIO   CONSOLIDADO '})}).comparable,true);
});
test('evolução percentuais usa pontos percentuais, sem média de taxas ou crescimento relativo',()=>{
  const old=sample();old.values.visits=200;const c=compareIndicatorPeriods({period:'2026-10',data:sample()},{period:'2026-09',data:old});
  assert.equal(c.metrics.conversionRate.absoluteChange,5);assert.equal(c.metrics.conversionRate.percentChange,null);
});
test('base anterior zero preserva diferença absoluta e deixa variação percentual indisponível',()=>{
  const old=sample();old.values.revenue='0.00';const c=compareIndicatorPeriods({period:'2026-10',data:sample()},{period:'2026-09',data:old});
  assert.equal(c.metrics.revenue.absoluteChange,1000);assert.equal(c.metrics.revenue.percentChange,null);assert.equal(c.metrics.revenue.reason,'zero_baseline');
});
test('metas de limite zero não dividem pelo alvo e mês parcial nunca é conclusão definitiva',()=>{
  const d=sample();d.values.claims=0;const goal={period:'2026-10',metricKey:'claims' as const,target:'0',direction:'at_most' as const};
  assert.equal(evaluateIndicatorGoal(goal,{period:'2026-10',data:d}).status,'achieved');
  const partial=evaluateIndicatorGoal(goal,{period:'2026-10',data:{...d,periodStatus:'partial'}});assert.equal(partial.status,'in_progress');assert.equal(partial.currentlyMeets,true);
  assert.equal(evaluateIndicatorGoal(goal,{period:'2026-09',data:d}).status,'not_informed');
});
test('metas de margem negativa preservam o valor e avaliam o sentido escolhido',()=>{
  const d=sample();d.values.totalCosts='1200.00';const goal={period:'2026-10',metricKey:'estimatedMargin' as const,target:'-10',direction:'at_least' as const};
  const result=evaluateIndicatorGoal(goal,{period:'2026-10',data:d});assert.equal(result.actual,-20);assert.equal(result.status,'not_achieved');assert.equal(result.difference,-10);
});
test('janelas preservam lacunas mensais e limitam consultas sem depender do fuso do processo',()=>{
  assert.equal(previousIndicatorMonth('2026-01'),'2025-12');assert.deepEqual(indicatorMonths('2026-08','2026-10'),['2026-08','2026-09','2026-10']);
  assert.throws(()=>indicatorMonths('2026-10','2026-08'));assert.throws(()=>indicatorMonths('2020-01','2026-10'));assert.throws(()=>previousIndicatorMonth('2026-13'));
});
