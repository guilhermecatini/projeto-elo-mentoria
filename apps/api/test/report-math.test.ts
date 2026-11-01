import test from 'node:test';
import assert from 'node:assert/strict';
import {reportWindow,percentile,sample,reportCsv} from '../src/report-math';
test('períodos equivalentes respeitam São Paulo, datas inválidas e fronteiras inclusivas',()=>{
  const w=reportWindow('2026-10-01','2026-10-31',new Date('2026-10-31T12:00:00Z'));
  assert.equal(w.days,31);assert.equal(w.startAt,'2026-10-01T03:00:00.000Z');assert.equal(w.endAt,'2026-11-01T03:00:00.000Z');
  assert.equal(w.previousFrom,'2026-08-31');assert.equal(w.previousTo,'2026-09-30');
  for(const [from,to]of[['2026-02-30','2026-03-01'],['2026-10-02','2026-10-01'],['2025-01-01','2026-10-01'],['2026-11-01','2026-11-02']])
    assert.throws(()=>reportWindow(from,to,new Date('2026-10-31T12:00:00Z')));
});
test('percentis interpolados publicam amostra e preservam zero sem inventar observações',()=>{
  assert.equal(percentile([],0.9),null);assert.equal(percentile([10,20,30,40],.5),25);assert.equal(percentile([10,20,30,40],.9),37);
  assert.deepEqual(sample([0,NaN,-1]),{n:1,medianMinutes:0,p90Minutes:0});assert.deepEqual(sample([]),{n:0,medianMinutes:null,p90Minutes:null});
});
test('exportação de relatórios preserva texto e neutraliza fórmulas com controles e aspas',()=>{
  const csv=reportCsv([['Cliente','Assunto'],['=1+1','  @teste'],['Seguro','texto "com aspas"\ne nova linha']]);
  assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.includes('"\'=1+1"'));assert.ok(csv.includes('"\'  @teste"'));assert.ok(csv.includes('"texto ""com aspas""\ne nova linha"'));
});
