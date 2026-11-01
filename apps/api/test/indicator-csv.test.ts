import test from 'node:test';
import assert from 'node:assert/strict';
import {parseIndicatorCsv,indicatorCsvTemplate,INDICATOR_CSV_MAX_BYTES} from '../src/indicator-csv';
test('modelo UTF-8 com BOM produz dados canônicos sem trocar ausentes por zero',()=>{
  const preview=parseIndicatorCsv(indicatorCsvTemplate('2026-10'));assert.equal(preview.version,1);assert.equal(preview.errors.length,0);assert.equal(preview.rows.length,1);
  const row=preview.rows[0];assert.equal(row.errors.length,0);assert.equal(row.line,2);assert.equal(row.data?.values.revenue,'1000.00');assert.equal(row.data?.values.claims,null);assert.equal(row.data?.basisConfirmed,true);
});
test('CSV aceita aspas, ponto e vírgula dentro do campo e observação em várias linhas',()=>{
  const p=parseIndicatorCsv('periodo;situacao;origem;observacoes\r\n2026-09;fechado;"Relatório; consolidado";"Primeira linha\r\nSegunda ""linha"""\r\n2026-10;parcial;Base;Fim');
  assert.equal(p.errors.length,0);assert.equal(p.rows[0].data?.sourceLabel,'Relatório; consolidado');assert.equal(p.rows[0].data?.notes,'Primeira linha\nSegunda "linha"');assert.equal(p.rows[1].line,4);
});
test('zero, valor decimal brasileiro e campos em branco têm sentidos distintos',()=>{
  const p=parseIndicatorCsv('periodo;situacao;origem;faturamento;pedidos;visitas\n2026-09;fechado;Base;0,00;0;\n2026-10;parcial;Base;1234.56;10;100');
  assert.equal(p.rows[0].data?.values.revenue,'0.00');assert.equal(p.rows[0].data?.values.orders,0);assert.equal(p.rows[0].data?.values.visits,null);assert.equal(p.rows[1].data?.values.revenue,'1234.56');
});
test('colunas desconhecidas, repetidas ou ausentes não são ignoradas',()=>{
  for(const csv of ['periodo;origem\n2026-10;Base','periodo;situacao;origem;origem\n2026-10;parcial;A;B','periodo;situacao;origem;surpresa\n2026-10;parcial;A;B'])assert.ok(parseIndicatorCsv(csv).errors.length);
  assert.ok(parseIndicatorCsv('periodo;situacao;origem').errors.length);
});
test('duplicidade de período e formatos ambíguos são mostrados na linha correta',()=>{
  const p=parseIndicatorCsv('periodo;situacao;origem;faturamento;pedidos\n2026-10;parcial;Base;1.000,00;1,5\n2026-10;parcial;Base;0;0');
  assert.ok(p.rows[0].errors.some(e=>e.field==='values.revenue'));assert.ok(p.rows[0].errors.some(e=>e.field==='values.orders'));assert.match(p.rows[1].errors[0].message,/linha 2/);
});
test('CSV malformado retorna erro explícito, sem interpretação parcial',()=>{
  for(const text of ['periodo,situacao,origem\n2026-10,parcial,Base','periodo;situacao;origem\n2026-10;parcial;"Base','periodo;situacao;origem\n2026-10;parcial;Ba"se','periodo;situacao;origem\n2026-10;parcial;"Base"extra'])assert.ok(parseIndicatorCsv(text).errors.length);
  const count=parseIndicatorCsv('periodo;situacao;origem\n2026-10;parcial;Base;extra');assert.ok(count.rows[0].errors.length);
});
test('arquivos grandes, linhas excessivas e texto inválido são recusados antes da prévia',()=>{
  assert.ok(parseIndicatorCsv('x'.repeat(INDICATOR_CSV_MAX_BYTES+1)).errors.length);
  assert.ok(parseIndicatorCsv('periodo;situacao;origem\n'+Array(201).fill('2026-10;parcial;Base').join('\n')).errors.length);
  for(const text of ['\0','\ufffd'])assert.ok(parseIndicatorCsv(text).errors.length);
});
test('linha com quantidade incorreta de campos preserva o mês para a conferência de duplicidades',()=>{
  const p=parseIndicatorCsv('origem;periodo;situacao;faturamento\nBase;2026-09;fechado;1000,00\nBase;2026-09;fechado;2000,00;extra\nBase;2026-08');
  assert.equal(p.rows.length,3);
  assert.equal(p.rows[1].period,'2026-09');assert.equal(p.rows[2].period,'2026-08');
  assert.ok(p.rows[1].errors.some(e=>e.field==='row'));assert.ok(p.rows[2].errors.some(e=>e.field==='row'));
  assert.equal(p.rows[1].data,undefined);assert.equal(p.rows[2].data,undefined);
});
test('conteúdo semelhante a fórmula permanece texto; confirmações não são presumidas',()=>{
  const p=parseIndicatorCsv('periodo;situacao;origem;observacoes;base_confirmada\n2026-10;parcial;Base;"=HYPERLINK(""https://exemplo.test"")";talvez');
  assert.ok(p.rows[0].errors.some(e=>e.field==='basisConfirmed'));
  const safe=parseIndicatorCsv('periodo;situacao;origem;observacoes\n2026-10;parcial;Base;=1+1');assert.equal(safe.rows[0].data?.notes,'=1+1');assert.equal(safe.rows[0].data?.basisConfirmed,false);
});
