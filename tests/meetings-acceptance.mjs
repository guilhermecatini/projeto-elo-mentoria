import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {config} from 'dotenv';
import knex from 'knex';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {resolve} from 'node:path';

config({quiet: true});
const database = 'elo_meetingscheck', origin = 'http://localhost:3338', runId = randomUUID();
const ownerBase = `postgresql://elo_owner:${process.env.DB_OWNER_PASSWORD}@127.0.0.1:55432/`;
const env = {...process.env, NODE_ENV: 'development', PORT: '3338', APP_ORIGIN: origin,
  DATABASE_URL: `postgresql://elo_app:${process.env.DB_APP_PASSWORD}@127.0.0.1:55432/${database}`,
  MIGRATION_DATABASE_URL: ownerBase + database, REDIS_URL: `redis://:${process.env.REDIS_PASSWORD}@127.0.0.1:56379/5`,
  UPLOAD_DIR: resolve('.local/test-uploads/elo_meetingscheck')};
let db, server, worker;
let admin, mentor, mentor2, mentee, mentee2, foreignAdmin, foreignMentorId, foreignMenteeId;
let own, other, foreign, meeting, otherMeeting, foreignMeeting, plan, otherPlan, foreignPlan;
const at = hours => new Date(Date.now() + hours * 3600e3).toISOString();
const dates = (start = 2, end = 3) => ({startsAt: at(start), endsAt: at(end)});
const future = () => at(24);

async function availablePort() {
  await new Promise((resolvePromise, reject) => {
    const probe = createServer();
    probe.once('error', () => reject(new Error('Porta 3338 ocupada; não reutilizar servidor existente.')));
    probe.listen(3338, '127.0.0.1', () => probe.close(resolvePromise));
  });
}
function cli(command) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, ['apps/api/dist/cli.js', command], {env, stdio: ['ignore', 'ignore', 'ignore']});
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolvePromise() : reject(new Error(`CLI ${command} falhou (${code}).`)));
  });
}
async function stopChild(child) {
  if (child && child.exitCode === null) {
    child.kill();
    await new Promise(resolvePromise => { child.once('exit', resolvePromise); const timer = setTimeout(resolvePromise, 3000); timer.unref(); });
  }
}
async function startApi() {
  server = spawn(process.execPath, ['apps/api/dist/main.js'], {env, stdio: ['ignore', 'ignore', 'ignore']});
  for (let attempt = 0; attempt < 80; attempt++) {
    if (server.exitCode !== null) throw new Error('API isolada encerrou antes de iniciar.');
    try { if ((await fetch(origin + '/api/health/live')).ok) return; } catch {}
    await new Promise(resolvePromise => setTimeout(resolvePromise, 150));
  }
  throw new Error('API isolada não iniciou.');
}
async function startWorker() {
  await new Promise((resolvePromise, reject) => {
    worker = spawn(process.execPath, ['apps/api/dist/worker.js'], {env, stdio: ['ignore', 'pipe', 'ignore']});
    let output = '', started = false;
    const timeout = setTimeout(() => reject(new Error('Worker isolado não iniciou.')), 15000);
    worker.stdout.on('data', bytes => {
      output += bytes;
      if (!started && output.includes('Worker de atendimento iniciado.')) { started = true; clearTimeout(timeout); resolvePromise(); }
    });
    worker.once('error', error => { clearTimeout(timeout); reject(error); });
    worker.once('exit', () => { clearTimeout(timeout); if (!started) reject(new Error('Worker isolado terminou prematuramente.')); });
  });
}
async function request(session, path, body, method = body === undefined ? 'GET' : 'POST') {
  const response = await fetch(origin + '/api' + path, {method,
    headers: {'Content-Type': 'application/json', Origin: origin, ...(session ? {Cookie: session.cookie, 'X-CSRF-Token': session.csrfToken} : {})},
    ...(body === undefined ? {} : {body: JSON.stringify(body)})});
  return {status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0]};
}
async function ok(session, path, body, method) {
  const result = await request(session, path, body, method);
  assert.ok(result.status >= 200 && result.status < 300, `${path}: ${result.status} ${JSON.stringify(result.data)}`);
  return result.data;
}
async function signin(email) {
  const result = await request(null, '/auth/login', {email, password: process.env.DEMO_PASSWORD});
  assert.equal(result.status, 201, JSON.stringify(result.data));
  return {...result.data, cookie: result.cookie};
}
async function client(actor, programId, hostId, memberId, label) {
  const result = await ok(actor, '/clients', {name: `${label} ${runId}`, contactName: 'Participante do ensaio', email: `${randomUUID()}@meetings.test`, programId, mentorId: hostId, startsAt: at(-24 * 30), endsAt: at(24 * 90)});
  if (memberId) await db('client_members').insert({organization_id: actor.user.organizationId, client_id: result.id, user_id: memberId});
  await db('assignments').where({enrollment_id: result.enrollmentId}).update({starts_at: at(-24 * 30)});
  return result;
}
async function schedule(actor, c, hostId, memberId, label, extra = {}) {
  return ok(actor, '/meetings', {enrollmentId: c.enrollmentId, title: `Reunião ${label} ${runId}`, hostId, participantIds: [hostId, ...(memberId ? [memberId] : [])], ...dates(), agenda: 'Revisar custos, decisões e próximos passos.', ...extra});
}
async function actionPlan(actor, c, label) {
  return ok(actor, '/plans', {enrollmentId: c.enrollmentId, title: `Plano ${label}`, objective: 'Executar decisões publicadas com evidências.'});
}
function minuteInput(summary, decisions = [{body: 'Revisar a margem dos kits com todos os custos.'}]) {
  return {summary, nextSteps: 'Revisar evidências na próxima reunião.', decisions};
}
const detail = (actor, item) => ok(actor, `/meetings/${item.id}`);
const outcome = (actor, item, status, reason) => ok(actor, `/meetings/${item.id}/outcome`, {status, ...(reason ? {reason} : {})});
const saveMinutes = (actor, item, input) => ok(actor, `/meetings/${item.id}/minutes`, input, 'PATCH');
const publish = (actor, item) => ok(actor, `/meetings/${item.id}/minutes/publish`, {});

before(async () => {
  assert.ok(process.env.DEMO_PASSWORD?.length >= 12);
  await availablePort();
  const connection = knex({client: 'pg', connection: ownerBase + 'postgres'});
  try { if (!(await connection('pg_database').where({datname: database}).first())) await connection.raw('CREATE DATABASE elo_meetingscheck OWNER elo_owner'); }
  finally { await connection.destroy(); }
  db = knex({client: 'pg', connection: ownerBase + database});
  await cli('migrate'); await cli('seed'); await startApi();
  const seedAdmin = await db('users').where({email: 'admin@demo.local'}).first();
  const accounts = ['admin', 'mentor', 'mentor2', 'mentee', 'mentee2'].map(label => ({id: randomUUID(), organization_id: seedAdmin.organization_id, name: `Ensaio reunião ${label}`, email: `${label}-${runId}@meeting.test`, role: label.replace('2', ''), password_hash: seedAdmin.password_hash}));
  await db('users').insert(accounts);
  [admin, mentor, mentor2, mentee, mentee2] = await Promise.all(accounts.map(account => signin(account.email)));
  const program = (await ok(admin, '/programs'))[0];
  own = await client(admin, program.id, mentor.user.id, mentee.user.id, 'Reuniões próprias');
  other = await client(admin, program.id, mentor2.user.id, mentee2.user.id, 'Reuniões de outra carteira');
  const foreignOrg = randomUUID(), foreignAdminId = randomUUID(), foreignProgram = randomUUID(), foreignEmail = `${runId}@foreign-meeting.test`;
  foreignMentorId = randomUUID();
  foreignMenteeId = randomUUID();
  await db.transaction(async trx => {
    await trx('organizations').insert({id: foreignOrg, name: 'Organização externa de reuniões'});
    await trx('users').insert([{id: foreignAdminId, organization_id: foreignOrg, name: 'Admin externo', email: foreignEmail, role: 'admin', password_hash: seedAdmin.password_hash}, {id: foreignMentorId, organization_id: foreignOrg, name: 'Mentor externo', email: `${randomUUID()}@foreign-meeting.test`, role: 'mentor', password_hash: seedAdmin.password_hash}, {id: foreignMenteeId, organization_id: foreignOrg, name: 'Mentorado externo', email: `${randomUUID()}@foreign-meeting.test`, role: 'mentee', password_hash: seedAdmin.password_hash}]);
    await trx('programs').insert({id: foreignProgram, organization_id: foreignOrg, name: 'Programa externo', calendar: JSON.stringify({timezone: 'America/Sao_Paulo', days: [1, 2, 3, 4, 5], startHour: 9, endHour: 18, holidays: []})});
  });
  foreignAdmin = await signin(foreignEmail);
  foreign = await client(foreignAdmin, foreignProgram, foreignMentorId, foreignMenteeId, 'Reuniões externas');
  meeting = await schedule(mentor, own, mentor.user.id, mentee.user.id, 'principal');
  otherMeeting = await schedule(mentor2, other, mentor2.user.id, mentee2.user.id, 'outra carteira');
  foreignMeeting = await schedule(foreignAdmin, foreign, foreignMentorId, foreignMenteeId, 'outra organização');
  plan = await actionPlan(mentor, own, 'próprio'); otherPlan = await actionPlan(mentor2, other, 'outra carteira'); foreignPlan = await actionPlan(foreignAdmin, foreign, 'externo');
});

test('Reuniões e atas: autorização, publicação, decisões e rotina de acompanhamento', async t => {
  await t.test('três perfis leem apenas a empresa autorizada e mentorado não altera a operação', async () => {
    for (const actor of [admin, mentor, mentee]) assert.equal((await detail(actor, meeting)).id, meeting.id);
    for (const actor of [mentor, mentee]) {
      assert.equal((await request(actor, `/meetings/${otherMeeting.id}`)).status, 404);
      assert.ok(!(await ok(actor, '/meetings')).some(value => value.id === otherMeeting.id));
      assert.deepEqual(await ok(actor, `/meetings?enrollmentId=${other.enrollmentId}`), []);
    }
    for (const actor of [admin, mentor, mentee]) assert.equal((await request(actor, `/meetings/${foreignMeeting.id}`)).status, 404);
    assert.equal((await request(mentor, `/enrollments/${other.enrollmentId}/meeting-participants`)).status, 404);
    assert.equal((await request(admin, `/enrollments/${foreign.enrollmentId}/meeting-participants`)).status, 404);
    const valid = {enrollmentId: own.enrollmentId, title: 'Sem permissão', hostId: mentor.user.id, participantIds: [mentee.user.id], ...dates()};
    assert.equal((await request(mentee, '/meetings', valid)).status, 403);
    assert.equal((await request(mentee, `/meetings/${meeting.id}`, {title: 'Alteração indevida'}, 'PATCH')).status, 403);
    assert.equal((await request(mentee, `/meetings/${meeting.id}/outcome`, {status: 'cancelled', reason: 'Indevido'})).status, 403);
    assert.equal((await request(mentee, `/meetings/${meeting.id}/attendance`, {participants: [{userId: mentee.user.id, status: 'excused'}]}, 'PATCH')).status, 403);
    assert.equal((await request(mentee, `/meetings/${meeting.id}/minutes`, minuteInput('Não pode escrever'), 'PATCH')).status, 403);
    assert.equal((await request(mentee, `/meetings/${meeting.id}/minutes/publish`, {})).status, 403);
    assert.equal((await request({...mentor, csrfToken: 'incorreto'}, `/meetings/${meeting.id}`, {title: 'CSRF'}, 'PATCH')).status, 403);
  });

  await t.test('participantes e condutor são ativos, autorizados e protegidos por vínculos no banco', async () => {
    const choices = await ok(mentor, `/enrollments/${own.enrollmentId}/meeting-participants`);
    for (const id of [admin.user.id, mentor.user.id, mentee.user.id]) assert.ok(choices.some(person => person.id === id));
    for (const id of [mentor2.user.id, mentee2.user.id, foreignMentorId]) assert.ok(!choices.some(person => person.id === id));
    const input = {enrollmentId: own.enrollmentId, title: 'Lista inválida', hostId: mentor.user.id, participantIds: [mentee.user.id], ...dates()};
    for (const hostId of [mentee.user.id, mentor2.user.id, foreignMentorId]) assert.equal((await request(mentor, '/meetings', {...input, hostId})).status, 400);
    for (const participantIds of [[mentor.user.id], [mentee2.user.id], [foreignMenteeId], [mentee.user.id, mentee.user.id]]) assert.equal((await request(mentor, '/meetings', {...input, participantIds})).status, 400);
    await db('users').where({id: mentee.user.id}).update({active: false});
    try { assert.equal((await request(mentor, '/meetings', input)).status, 400); }
    finally { await db('users').where({id: mentee.user.id}).update({active: true}); }
    await assert.rejects(() => db('meetings').insert({id: randomUUID(), organization_id: admin.user.organizationId, enrollment_id: foreign.enrollmentId, created_by: admin.user.id, host_id: mentor.user.id, host_name: 'Inválido', title: 'Vínculo externo', starts_at: at(2), ends_at: at(3)}), error => error.code === '23503');
  });

  await t.test('horários preservam instantes UTC e remarcar exige motivo e reinicia presença pendente', async () => {
    const start = new Date(Date.now() + 4 * 3600e3), end = new Date(start.getTime() + 3600e3);
    const offset = date => new Date(date.getTime() - 3 * 3600e3).toISOString().replace('Z', '-03:00');
    assert.equal((await request(mentor, `/meetings/${meeting.id}`, {startsAt: offset(start), endsAt: offset(end)}, 'PATCH')).status, 400);
    assert.equal((await request(mentor, `/meetings/${meeting.id}/attendance`, {participants: [{userId: mentee.user.id, status: 'present'}]}, 'PATCH')).status, 400);
    await ok(mentor, `/meetings/${meeting.id}/attendance`, {participants: [{userId: mentee.user.id, status: 'excused', note: 'Justificativa privada de presença.'}]}, 'PATCH');
    assert.equal((await detail(mentor, meeting)).attendanceSummary.excused, 1);
    await ok(mentor, `/meetings/${meeting.id}`, {startsAt: offset(start), endsAt: offset(end), reason: 'Solicitação de novo horário.'}, 'PATCH');
    const current = await detail(mentor, meeting);
    assert.equal(new Date(current.startsAt).getTime(), start.getTime());
    assert.equal(new Date(current.endsAt).getTime(), end.getTime());
    assert.equal(current.attendanceSummary.pending, current.attendanceSummary.total);
    assert.ok(JSON.stringify(current.history).includes('Solicitação de novo horário.'));
    assert.ok(!JSON.stringify(await detail(mentee, meeting)).includes('Justificativa privada'));
    const input = {enrollmentId: own.enrollmentId, title: 'Horário inválido', hostId: mentor.user.id, participantIds: [mentee.user.id]};
    for (const times of [{startsAt: at(2), endsAt: at(1)}, dates(1, 10), dates(-24 * 31, -24 * 31 + 1), dates(24 * 91, 24 * 91 + 1)]) assert.equal((await request(mentor, '/meetings', {...input, ...times})).status, 400);
    for (const location of ['javascript:alert(1)', 'http://example.test/reuniao', 'https://user:password@example.test/reuniao']) assert.equal((await request(mentor, '/meetings', {...input, ...dates(), location})).status, 400);
  });

  await t.test('resultados futuros são recusados e cancelamento ou ausência preservam histórico', async () => {
    assert.equal((await request(mentor, `/meetings/${meeting.id}/outcome`, {status: 'held'})).status, 400);
    assert.equal((await request(mentor, `/meetings/${meeting.id}/outcome`, {status: 'no_show'})).status, 400);
    const cancelled = await schedule(mentor, own, mentor.user.id, mentee.user.id, 'cancelamento');
    assert.equal((await request(mentor, `/meetings/${cancelled.id}/outcome`, {status: 'cancelled'})).status, 400);
    await outcome(mentor, cancelled, 'cancelled', 'Cliente pediu cancelamento desta ocorrência.');
    assert.equal((await detail(mentee, cancelled)).status, 'cancelled');
    assert.equal((await request(mentor, `/meetings/${cancelled.id}`, {title: 'Não reescrever resultado'}, 'PATCH')).status, 400);
    assert.equal((await request(mentor, `/meetings/${cancelled.id}/outcome`, {status: 'held'})).status, 400);
    const missed = await schedule(mentor, own, mentor.user.id, mentee.user.id, 'ausência', dates(-3, -2));
    assert.equal((await request(mentor, `/meetings/${missed.id}/outcome`, {status: 'no_show'})).status, 400);
    await ok(mentor, `/meetings/${missed.id}/attendance`, {participants: [{userId: mentor.user.id, status: 'present'}, {userId: mentee.user.id, status: 'absent', note: 'Contato não ingressou.'}]}, 'PATCH');
    await outcome(mentor, missed, 'no_show', 'Mentorado não compareceu.');
    const absent = await detail(mentor, missed);
    assert.equal(absent.status, 'no_show'); assert.equal(absent.attendanceSummary.absent, 1); assert.equal(absent.heldAt, null);
    assert.equal((await request(mentor, `/meetings/${missed.id}/minutes`, minuteInput('Não houve reunião'), 'PATCH')).status, 400);
  });

  let held, decision;
  await t.test('rascunho e notas de presença nunca aparecem para mentorado antes da publicação', async () => {
    held = await schedule(mentor, own, mentor.user.id, mentee.user.id, 'ata', dates(-2, -1));
    const secret = `Rascunho reservado ${runId}`;
    await saveMinutes(mentor, held, minuteInput(secret));
    const staff = await detail(mentor, held); decision = staff.draftMinutes.decisions[0];
    assert.equal(staff.draftMinutes.summary, secret);
    assert.ok(JSON.stringify(staff.history).includes(secret));
    for (const path of [`/meetings/${held.id}`, '/meetings', `/clients/${own.id}`, '/notifications', '/dashboard']) assert.ok(!JSON.stringify(await ok(mentee, path)).includes(secret));
    const publicView = await detail(mentee, held);
    assert.equal(publicView.publishedMinutes, null); assert.ok(!('draftMinutes' in publicView)); assert.ok(!('history' in publicView));
    const conversion = {planId: plan.id, assigneeId: mentee.user.id, dueAt: future(), completionCriteria: 'Verificar todos os custos.'};
    assert.equal((await request(mentor, `/meetings/${held.id}/decisions/${decision.id}/task`, conversion)).status, 400);
    assert.equal((await request(mentor, `/meetings/${held.id}/minutes/publish`, {})).status, 400);
    await outcome(mentor, held, 'held');
    assert.equal((await request(mentor, `/meetings/${held.id}/minutes/publish`, {})).status, 400);
    assert.equal((await db('enrollments').where({id: own.enrollmentId}).first()).last_contact_at, null);
    await ok(mentor, `/meetings/${held.id}/attendance`, {participants: [{userId: mentor.user.id, status: 'present', note: 'Nota interna da equipe.'}, {userId: mentee.user.id, status: 'present', note: 'Nota de presença privada.'}]}, 'PATCH');
    assert.ok(!JSON.stringify(await detail(mentee, held)).includes('Nota de presença privada'));
    await saveMinutes(mentor, held, minuteInput('Resumo publicado: revisamos a margem.', [{id: decision.id, body: decision.body}]));
    const published = await publish(mentor, held); assert.equal(published.version, 1);
    const received = await detail(mentee, held); assert.equal(received.publishedMinutes.summary, 'Resumo publicado: revisamos a margem.');
    assert.equal(new Date((await db('enrollments').where({id: own.enrollmentId}).first()).last_contact_at).getTime(), new Date(received.startsAt).getTime());
  });

  await t.test('editar novo rascunho preserva a ata pública anterior e publicar cria versão auditável', async () => {
    const original = (await detail(mentee, held)).publishedMinutes;
    const pending = `Complemento ainda privado ${runId}`;
    await saveMinutes(mentor, held, minuteInput(pending, [{id: decision.id, body: decision.body}]));
    const reading = await detail(mentee, held);
    assert.deepEqual(reading.publishedMinutes, original);
    assert.ok(!JSON.stringify(reading).includes(pending));
    const contact = new Date(); await db('enrollments').where({id: own.enrollmentId}).update({last_contact_at: contact});
    const published = await publish(mentor, held); assert.equal(published.version, 2);
    assert.equal((await detail(mentee, held)).publishedMinutes.summary, pending);
    assert.equal(new Date((await db('enrollments').where({id: own.enrollmentId}).first()).last_contact_at).getTime(), contact.getTime());
    const revisions = await db('meeting_minutes_revisions').where({meeting_id: held.id}).orderBy('version');
    assert.deepEqual(revisions.map(value => value.version), [1, 2]);
    assert.equal(revisions[0].summary, original.summary);
    const notificationCount = Number((await db('notifications').where({meeting_id: held.id}).count('* as n').first()).n);
    const retry = await publish(mentor, held); assert.equal(retry.alreadyPublished, true); assert.equal(retry.version, 2);
    assert.equal(Number((await db('notifications').where({meeting_id: held.id}).count('* as n').first()).n), notificationCount);
    assert.equal(Number((await db('meeting_minutes_revisions').where({meeting_id: held.id}).count('* as n').first()).n), 2);
  });

  await t.test('conversão exige decisão publicada, plano ativo da mesma contratação e responsável autorizado', async () => {
    const input = {planId: plan.id, assigneeId: mentee.user.id, dueAt: future(), completionCriteria: 'Memória de cálculo com todos os custos.'};
    const path = `/meetings/${held.id}/decisions/${decision.id}/task`;
    assert.equal((await request(mentee, path, input)).status, 403);
    assert.equal((await request(mentor2, path, input)).status, 404);
    for (const planId of [otherPlan.id, foreignPlan.id]) assert.equal((await request(admin, path, {...input, planId})).status, 404);
    for (const assigneeId of [admin.user.id, mentor2.user.id, mentee2.user.id, foreignMenteeId]) assert.equal((await request(mentor, path, {...input, assigneeId})).status, 400);
    await ok(mentor, `/plans/${plan.id}`, {status: 'draft'}, 'PATCH');
    assert.equal((await request(mentor, path, input)).status, 400);
    await ok(mentor, `/plans/${plan.id}`, {status: 'active'}, 'PATCH');
    const draft = (await detail(mentor, held)).draftMinutes;
    await saveMinutes(mentor, held, {summary: draft.summary, nextSteps: draft.nextSteps, decisions: [{id: decision.id, body: decision.body + ' Mudança ainda não publicada.'}]});
    assert.equal((await request(mentor, path, input)).status, 400);
    await saveMinutes(mentor, held, minuteInput(draft.summary, [{id: decision.id, body: decision.body}]));
  });

  await t.test('repetições concorrentes criam uma tarefa e mantêm texto, autoria e vínculo sem progresso artificial', async () => {
    const input = {planId: plan.id, assigneeId: mentee.user.id, dueAt: future(), completionCriteria: 'Memória de cálculo com todos os custos.'};
    const path = `/meetings/${held.id}/decisions/${decision.id}/task`;
    const before = await ok(mentor, `/plans/${plan.id}`);
    const results = await Promise.all([ok(mentor, path, input), ok(mentor, path, input)]);
    assert.equal(results[0].taskId, results[1].taskId);
    assert.deepEqual(results.map(value => value.created).sort(), [false, true]);
    const linked = await ok(mentee, `/tasks/${results[0].taskId}`);
    assert.equal(linked.title, decision.body.slice(0, 200)); assert.equal(linked.description, decision.body);
    assert.equal(linked.originMeetingId, held.id);
    assert.equal(linked.completionCriteria, input.completionCriteria); assert.equal(linked.status, 'todo');
    const current = await ok(mentor, `/plans/${plan.id}`); assert.equal(current.lastProgressAt, before.lastProgressAt);
    assert.equal(Number((await db('tasks').where({created_from_decision_id: decision.id}).count('* as n').first()).n), 1);
    assert.equal((await db('meeting_decisions').where({id: decision.id}).first()).task_id, linked.id);
    assert.equal((await detail(mentee, held)).publishedMinutes.decisions.find(value => value.id === decision.id).taskId, linked.id);
    assert.equal((await request(mentor, `/meetings/${held.id}/minutes`, minuteInput('Não remover decisão convertida', []), 'PATCH')).status, 400);
    assert.equal((await request(mentor, `/meetings/${held.id}/minutes`, minuteInput('Não editar decisão convertida', [{id: decision.id, body: 'Texto divergente'}]), 'PATCH')).status, 400);
    assert.equal((await request(mentor, `/meetings/${meeting.id}/decisions/${decision.id}/task`, input)).status, 404);
  });

  await t.test('troca de mentor e cobertura expirada revogam reuniões sem apagar autores ou atas', async () => {
    const before = await detail(admin, held);
    await ok(admin, `/enrollments/${own.enrollmentId}/assignments`, {mentorId: mentor2.user.id, kind: 'primary'});
    assert.equal((await request(mentor, `/meetings/${held.id}`)).status, 404);
    assert.equal((await request(mentor, `/meetings/${held.id}/minutes`, minuteInput('Sem acesso'), 'PATCH')).status, 404);
    assert.ok(!(await ok(mentor, '/meetings')).some(value => value.id === held.id));
    const after = await detail(mentor2, held); assert.deepEqual(after.publishedMinutes, before.publishedMinutes); assert.deepEqual(after.history, before.history);
    const dashboard = await ok(mentor2, '/dashboard'); assert.ok(dashboard.attention.some(value => value.type === 'orphan_meeting' && value.meetingId === meeting.id));
    assert.ok(!(await ok(mentee, '/dashboard')).attention.some(value => value.type === 'orphan_meeting'));
    await ok(admin, `/enrollments/${own.enrollmentId}/assignments`, {mentorId: mentor.user.id, kind: 'coverage', endsAt: future()});
    assert.equal((await request(mentor, `/meetings/${held.id}`)).status, 200);
    await db('assignments').where({enrollment_id: own.enrollmentId, mentor_id: mentor.user.id, kind: 'coverage'}).update({starts_at: at(-1), ends_at: at(-0.01)});
    assert.equal((await request(mentor, `/meetings/${held.id}`)).status, 404);
    await ok(admin, `/enrollments/${own.enrollmentId}/assignments`, {mentorId: mentor.user.id, kind: 'primary'});
  });

  await t.test('painel distingue falta de agenda, reunião sem resultado e ata não publicada', async () => {
    const program = (await ok(admin, '/programs'))[0];
    const c = await client(admin, program.id, mentor.user.id, mentee.user.id, 'Agenda para sinais');
    const signal = async type => (await ok(mentor, '/dashboard')).attention.find(value => value.type === type && value.enrollmentId === c.enrollmentId);
    assert.ok(await signal('missing_next_meeting'));
    const ongoing = await schedule(mentor, c, mentor.user.id, mentee.user.id, 'em andamento', dates(-0.001, 0.5));
    assert.equal(await signal('missing_next_meeting'), undefined);
    const today = await ok(mentor, '/dashboard'); assert.ok(today.stats.meetingsToday >= 1);
    await outcome(mentor, ongoing, 'cancelled', 'Cancelada para ensaio da agenda.');
    assert.ok(await signal('missing_next_meeting'));
    const expired = await schedule(mentor, c, mentor.user.id, mentee.user.id, 'sem resultado', dates(-2, -1));
    const overdue = await signal('overdue_meeting'); assert.equal(overdue.meetingId, expired.id); assert.equal(overdue.actionUrl, `/meetings/${expired.id}`);
    assert.match(overdue.reason, /sem resultado/);
    await outcome(mentor, expired, 'held');
    assert.equal(await signal('overdue_meeting'), undefined);
    const unpublished = await signal('unpublished_minutes'); assert.equal(unpublished.meetingId, expired.id);
    assert.ok(!(await ok(mentee, '/dashboard')).attention.some(value => value.type === 'unpublished_minutes' && value.meetingId === expired.id));
    await saveMinutes(mentor, expired, minuteInput('Ata do ensaio de sinais.'));
    await ok(mentor, `/meetings/${expired.id}/attendance`, {participants: [{userId: mentor.user.id, status: 'present'}, {userId: mentee.user.id, status: 'present'}]}, 'PATCH');
    await publish(mentor, expired);
    assert.equal(await signal('unpublished_minutes'), undefined);
    assert.ok(await signal('missing_next_meeting'));
    await db('enrollments').where({id: c.enrollmentId}).update({status: 'paused'});
    assert.equal(await signal('missing_next_meeting'), undefined);
  });

  await t.test('alertas são privados da equipe, idempotentes e persistem após reinício real da API e worker', async () => {
    const program = (await ok(admin, '/programs'))[0];
    const c = await client(admin, program.id, mentor.user.id, mentee.user.id, 'Agenda persistente');
    await Promise.all([cli('reconcile'), cli('reconcile')]);
    const key = `missing_next_meeting:${c.enrollmentId}`;
    const count = async () => Number((await db('notifications').where({enrollment_id: c.enrollmentId}).where('dedupe_key', 'like', `action:${key}:%`).count('* as n').first()).n);
    const initial = await count(); assert.ok(initial >= 2);
    const notification = (await ok(mentor, '/notifications')).find(value => value.enrollmentId === c.enrollmentId && value.actionUrl?.includes('filter=missing'));
    assert.ok(notification);
    assert.equal(notification.actionUrl, `/meetings?enrollmentId=${c.enrollmentId}&filter=missing`);
    assert.ok(!('dedupe_key' in notification));
    assert.equal(Number((await db('notifications').where({enrollment_id: c.enrollmentId, user_id: mentee.user.id}).where('dedupe_key', 'like', 'action:%').count('* as n').first()).n), 0);
    await startWorker(); await stopChild(worker); await stopChild(server); await startApi(); await startWorker(); await stopChild(worker);
    assert.equal(await count(), initial);
    let state = await db('action_signal_states').where({organization_id: admin.user.organizationId, signal_key: key}).first();
    assert.equal(state.episode, 1); assert.equal(state.active, true);
    const next = await schedule(mentor, c, mentor.user.id, mentee.user.id, 'próxima ocorrência');
    await cli('reconcile');
    state = await db('action_signal_states').where({organization_id: admin.user.organizationId, signal_key: key}).first(); assert.equal(state.active, false);
    await outcome(mentor, next, 'cancelled', 'Ocorrência cancelada exige novo agendamento.');
    await cli('reconcile');
    state = await db('action_signal_states').where({organization_id: admin.user.organizationId, signal_key: key}).first(); assert.equal(state.episode, 2);
    assert.equal(await count(), initial * 2);
  });
});

after(async () => { await stopChild(worker); await stopChild(server); if (db) await db.destroy(); });
