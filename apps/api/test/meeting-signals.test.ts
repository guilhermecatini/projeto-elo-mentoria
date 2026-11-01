import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateMeetingSignals,meetingDayBounds} from '../src/meeting-signals';

const now=new Date('2026-10-30T18:00:00Z');
const enrollment={id:'e1',organization_id:'o1',client_id:'c1',client_name:'Loja',status:'active'};
const meeting={id:'m1',enrollment_id:'e1',title:'Revisão',status:'scheduled',starts_at:'2026-10-30T19:00:00Z',ends_at:'2026-10-30T20:00:00Z',host_has_access:true,has_published_minutes:false};
const signals=(meetings:any[]=[],staff=true,e:any=enrollment)=>evaluateMeetingSignals([e],meetings,now,staff);

test('contratação sem reunião futura exige agendamento com destino específico',()=>{
  const result=signals();assert.equal(result.length,1);assert.equal(result[0].type,'missing_next_meeting');assert.match(result[0].actionUrl,/enrollmentId=e1/);
});
test('ciclo futuro não gera cobrança de próxima reunião',()=>{
  assert.deepEqual(signals([],true,{...enrollment,starts_at:'2026-11-01T00:00:00Z'}),[]);
});
test('próxima reunião inclui encontro em andamento e instante final exato',()=>{
  assert.equal(signals([meeting]).length,0);
  assert.equal(signals([{...meeting,starts_at:'2026-10-30T17:00:00Z',ends_at:now}]).length,0);
});
test('reunião encerrada sem resultado não é automaticamente uma falta',()=>{
  const result=signals([{...meeting,ends_at:new Date(now.getTime()-1)}]);
  assert.deepEqual(result.map(s=>s.type),['missing_next_meeting','overdue_meeting']);
  assert.match(result[1].reason,/sem resultado registrado/);assert.equal(result[1].meetingId,'m1');
});
test('realizadas, faltas e canceladas não satisfazem próximo encontro',()=>{
  for (const status of ['held','no_show','cancelled']) assert.ok(signals([{...meeting,status,has_published_minutes:true}]).some(s=>s.type==='missing_next_meeting'));
});
test('responsável sem acesso atual não esconde ausência de próxima reunião',()=>{
  const result=signals([{...meeting,host_has_access:false}]);
  assert.deepEqual(result.map(s=>s.type),['missing_next_meeting','orphan_meeting']);
  assert.equal(signals([{...meeting,host_has_access:false}],false).some(s=>s.type==='orphan_meeting'),false);
});
test('ata pendente aparece somente para equipe e encerra ao publicar',()=>{
  assert.ok(signals([{...meeting,status:'held'}]).some(s=>s.type==='unpublished_minutes'));
  assert.equal(signals([{...meeting,status:'held'}],false).some(s=>s.type==='unpublished_minutes'),false);
  assert.equal(signals([{...meeting,status:'held',has_published_minutes:true}]).some(s=>s.type==='unpublished_minutes'),false);
});
test('contratação pausada e reuniões de outro ciclo não influenciam cobrança',()=>{
  assert.equal(signals([meeting],true,{...enrollment,status:'paused'}).length,0);
  assert.equal(signals([{...meeting,enrollment_id:'e2'}])[0].type,'missing_next_meeting');
});
test('dia do painel segue São Paulo inclusive na fronteira UTC',()=>{
  const before=meetingDayBounds(new Date('2026-10-31T02:59:59Z'));
  assert.equal(before.start.toISOString(),'2026-10-30T03:00:00.000Z');
  assert.equal(before.end.toISOString(),'2026-10-31T03:00:00.000Z');
  assert.equal(meetingDayBounds(new Date('2026-10-31T03:00:00Z')).start.toISOString(),before.end.toISOString());
});
