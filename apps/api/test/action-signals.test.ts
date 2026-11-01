import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateActionSignals} from '../src/action-signals';

const now = new Date('2026-10-30T18:00:00Z');
const enrollment = {id:'e1',organization_id:'o1',client_id:'c1',client_name:'Loja',status:'active'};
const plan = {id:'p1',enrollment_id:'e1',title:'Catálogo',status:'active',stale_days:7,last_progress_at:'2026-10-25T18:00:00Z'};
const task = {id:'t1',plan_id:'p1',assignee_id:'u1',title:'Revisar fotos',status:'todo',assignee_has_access:true,due_at:'2026-10-29T18:00:00Z'};
const signals = (plans:any[]=[plan],tasks:any[]=[task],e:any=enrollment) => evaluateActionSignals([e],plans,tasks,now);

test('matrícula sem plano ativo inclui motivo e ação concreta',()=>{
  const result=signals([],[]);assert.equal(result.length,1);assert.equal(result[0].type,'missing_plan');assert.match(result[0].actionUrl,/enrollmentId=e1/);
  assert.equal(signals([{...plan,status:'draft'}],[])[0].type,'missing_plan');
});
test('estagnação usa fronteira exata em dias corridos e não updated_at',()=>{
  const result=signals([{...plan,last_progress_at:'2026-10-23T18:00:00Z',updated_at:now}],[]);
  assert.equal(result[0].type,'stalled_plan');assert.equal(result[0].dueAt?.toISOString(),'2026-10-30T18:00:00.000Z');
  assert.equal(signals([{...plan,last_progress_at:'2026-10-23T18:00:00.001Z'}],[]).length,0);
});
test('entrega pendente de revisão satisfaz prazo de entrega',()=>{
  const result=signals([plan],[{...task,status:'submitted'}]);assert.deepEqual(result.map(s=>s.type),['pending_review']);
});
test('bloqueio pode coexistir com atraso e carrega links da tarefa',()=>{
  const result=signals([plan],[{...task,status:'blocked'}]);assert.deepEqual(result.map(s=>s.type),['overdue_task','blocked_task']);
  assert.ok(result.every(s=>s.taskId==='t1'&&s.actionUrl==='/tasks/t1'));
});
test('tarefa concluída ou cancelada não gera pendência',()=>{
  assert.equal(signals([plan],[{...task,status:'done'},{...task,id:'t2',status:'cancelled'}]).length,0);
});
test('perda do acesso do responsável exige reatribuição',()=>{
  const result=signals([plan],[{...task,assignee_has_access:false}]);assert.ok(result.some(s=>s.type==='orphan_task'));
});
test('planos encerrados e matrículas pausadas não geram cobrança operacional',()=>{
  assert.deepEqual(signals([{...plan,status:'archived'}],[task]).map(s=>s.type),['missing_plan']);
  assert.equal(signals([plan],[task],{...enrollment,status:'paused'}).length,0);
});
test('prazo de entrega só vence depois do instante limite',()=>{
  assert.equal(signals([plan],[{...task,due_at:now.toISOString()}]).length,0);
});
test('ciclo futuro ainda não gera cobrança de plano ou tarefa',()=>{
  assert.deepEqual(signals([],[],{...enrollment,starts_at:'2026-11-01T00:00:00Z'}),[]);
  assert.deepEqual(signals([plan],[task],{...enrollment,starts_at:'2026-11-01T00:00:00Z'}),[]);
});
