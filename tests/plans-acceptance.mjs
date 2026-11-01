import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {config} from 'dotenv';
import knex from 'knex';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {resolve} from 'node:path';

config({quiet: true});
const database = 'elo_planscheck';
const origin = 'http://localhost:3336';
const runId = randomUUID();
const ownerBase = `postgresql://elo_owner:${process.env.DB_OWNER_PASSWORD}@127.0.0.1:55432/`;
const env = {
  ...process.env, NODE_ENV: 'development', PORT: '3336', APP_ORIGIN: origin,
  DATABASE_URL: `postgresql://elo_app:${process.env.DB_APP_PASSWORD}@127.0.0.1:55432/${database}`,
  MIGRATION_DATABASE_URL: ownerBase + database,
  REDIS_URL: `redis://:${process.env.REDIS_PASSWORD}@127.0.0.1:56379/3`,
  UPLOAD_DIR: resolve('.local/test-uploads/elo_planscheck'),
};
let db, server;
let admin, mentor, mentor2, mentee, mentee2, foreignAdmin, foreignMentorId;
let own, other, foreign, plan, otherPlan, otherTask, foreignPlan, foreignTask;
const future = () => new Date(Date.now() + 3 * 86400e3).toISOString();
const past = (days = 10) => new Date(Date.now() - days * 86400e3);

function cli(command) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['apps/api/dist/cli.js', command], {env, stdio: ['ignore', 'pipe', 'pipe']});
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', () => {});
    const timeout = setTimeout(() => { child.kill(); reject(new Error(`CLI ${command} excedeu 30 segundos.`)); }, 30000);
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', code => { clearTimeout(timeout); code === 0 ? resolve(output) : reject(new Error(`CLI ${command} falhou (${code}).`)); });
  });
}
async function request(session, path, body, method = body === undefined ? 'GET' : 'POST') {
  const response = await fetch(origin + '/api' + path, {
    method,
    headers: {'Content-Type': 'application/json', Origin: origin, ...(session ? {Cookie: session.cookie, 'X-CSRF-Token': session.csrfToken} : {})},
    ...(body === undefined ? {} : {body: JSON.stringify(body)}),
  });
  const data = response.headers.get('content-type')?.includes('json') ? await response.json() : await response.text();
  return {status: response.status, data, cookie: response.headers.get('set-cookie')?.split(';')[0]};
}
async function ok(session, path, body, method) {
  const result = await request(session, path, body, method);
  assert.ok(result.status >= 200 && result.status < 300, `${path}: ${result.status} ${JSON.stringify(result.data)}`);
  return result.data;
}
async function denied(session, path, body, method, statuses = [403, 404]) {
  const result = await request(session, path, body, method);
  assert.ok(statuses.includes(result.status), `${path} deveria negar acesso, recebeu ${result.status}: ${JSON.stringify(result.data)}`);
  return result;
}
async function signin(email) {
  const result = await request(null, '/auth/login', {email, password: process.env.DEMO_PASSWORD});
  assert.equal(result.status, 201, JSON.stringify(result.data));
  return {...result.data, cookie: result.cookie};
}
async function createPlan(actor, client, label, extra = {}) {
  return ok(actor, '/plans', {enrollmentId: client.enrollmentId, title: `Plano ${label} ${runId}`, objective: 'Melhorar a margem com evidências verificáveis.', baseline: 'Custos ainda não revisados.', target: 'Todos os kits com margem documentada.', ...extra});
}
async function createTask(actor, parent, assigneeId, extra = {}) {
  return ok(actor, `/plans/${parent.id}/tasks`, {title: 'Revisar custos de um kit', assigneeId, dueAt: future(), completionCriteria: 'Apresentar memória de cálculo com frete e custos.', ...extra});
}
const transition = (actor, task, body) => ok(actor, `/tasks/${task.id}/transition`, body);
async function fixtureClient(actor, programId, assignedMentor, member, label) {
  const client = await ok(actor, '/clients', {name: `${label} ${runId}`, contactName: 'Pessoa de teste', email: `${randomUUID()}@plans.test`, programId, mentorId: assignedMentor});
  if (member) await db('client_members').insert({organization_id: actor.user.organizationId, client_id: client.id, user_id: member});
  return client;
}

before(async () => {
  assert.ok(process.env.DEMO_PASSWORD?.length >= 12, 'Defina DEMO_PASSWORD de desenvolvimento.');
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', () => reject(new Error('Porta 3336 ocupada; o teste não reutiliza servidores existentes.')));
    probe.listen(3336, '127.0.0.1', () => probe.close(resolve));
  });
  const serverDb = knex({client: 'pg', connection: ownerBase + 'postgres'});
  try {
    if (!(await serverDb('pg_database').where({datname: database}).first())) await serverDb.raw('CREATE DATABASE elo_planscheck OWNER elo_owner');
  } finally { await serverDb.destroy(); }
  db = knex({client: 'pg', connection: ownerBase + database});
  await cli('migrate');
  await cli('seed');
  server = spawn(process.execPath, ['apps/api/dist/main.js'], {env, stdio: ['ignore', 'ignore', 'ignore']});
  for (let attempt = 0; attempt < 80; attempt++) {
    if (server.exitCode !== null) throw new Error('A API isolada terminou antes de ficar disponível.');
    try { if ((await fetch(origin + '/api/health/live')).ok) break; } catch {}
    if (attempt === 79) throw new Error('A API isolada não iniciou.');
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  admin = await signin('admin@demo.local');
  mentor = await signin('mentor@demo.local');
  mentor2 = await signin('mentor2@demo.local');
  mentee = await signin('mentorado@demo.local');
  mentee2 = await signin('mentorado2@demo.local');
  const program = (await ok(admin, '/programs'))[0];
  own = await fixtureClient(admin, program.id, mentor.user.id, mentee.user.id, 'Carteira própria');
  other = await fixtureClient(admin, program.id, mentor2.user.id, mentee2.user.id, 'Outra carteira');
  const foreignOrg = randomUUID(), foreignAdminId = randomUUID(), foreignProgram = randomUUID();
  foreignMentorId = randomUUID();
  const passwordHash = (await db('users').where({id: admin.user.id}).first()).password_hash;
  const foreignEmail = `${runId}@foreign-plans.test`;
  await db.transaction(async trx => {
    await trx('organizations').insert({id: foreignOrg, name: 'Organização isolada para autorização'});
    await trx('users').insert([
      {id: foreignAdminId, organization_id: foreignOrg, name: 'Admin estrangeiro', email: foreignEmail, role: 'admin', password_hash: passwordHash},
      {id: foreignMentorId, organization_id: foreignOrg, name: 'Mentor estrangeiro', email: `${randomUUID()}@foreign-plans.test`, role: 'mentor', password_hash: passwordHash},
    ]);
    await trx('programs').insert({id: foreignProgram, organization_id: foreignOrg, name: 'Programa estrangeiro', calendar: JSON.stringify({timezone: 'America/Sao_Paulo', days: [1, 2, 3, 4, 5], startHour: 9, endHour: 18, holidays: []})});
  });
  foreignAdmin = await signin(foreignEmail);
  foreign = await fixtureClient(foreignAdmin, foreignProgram, foreignMentorId, null, 'Outra organização');
  plan = await createPlan(mentor, own, 'principal');
  otherPlan = await createPlan(mentor2, other, 'outra carteira');
  otherTask = await createTask(mentor2, otherPlan, mentee2.user.id);
  foreignPlan = await createPlan(foreignAdmin, foreign, 'estrangeiro');
  foreignTask = await createTask(foreignAdmin, foreignPlan, foreignMentorId);
});

test('Planos e tarefas: permissões, fluxo, concorrência e indicadores reais', async t => {
  await t.test('progresso vazio é não informado e responsáveis respeitam acesso vigente', async () => {
    const detail = await ok(mentee, `/plans/${plan.id}`);
    assert.equal(detail.progressPercent, null);
    assert.equal(detail.tasks.length, 0);
    const choices = await ok(mentor, `/enrollments/${own.enrollmentId}/task-assignees`);
    assert.ok(choices.some(user => user.id === mentor.user.id));
    assert.ok(choices.some(user => user.id === mentee.user.id));
    for (const id of [admin.user.id, mentor2.user.id, mentee2.user.id, foreignMentorId]) assert.ok(!choices.some(user => user.id === id));
    await denied(mentee, '/plans', {enrollmentId: own.enrollmentId, title: 'Sem permissão', objective: 'Não deve criar.'}, 'POST', [403]);
    await denied(mentee, `/plans/${plan.id}`, {title: 'Alteração indevida'}, 'PATCH', [403]);
    await denied(mentee, `/plans/${plan.id}/tasks`, {title: 'Indevida', assigneeId: mentee.user.id, dueAt: future(), completionCriteria: 'Verificar'}, 'POST', [403]);
  });

  await t.test('IDs, filtros, listas e responsáveis não atravessam carteira ou organização', async () => {
    for (const actor of [mentor, mentee]) {
      await denied(actor, `/plans/${otherPlan.id}`, undefined, 'GET', [404]);
      await denied(actor, `/tasks/${otherTask.id}`, undefined, 'GET', [404]);
      await denied(actor, `/enrollments/${other.enrollmentId}/task-assignees`, undefined, 'GET', [404]);
      assert.ok(!(await ok(actor, '/plans')).some(value => value.id === otherPlan.id));
      assert.ok(!(await ok(actor, '/tasks')).some(value => value.id === otherTask.id));
      const filtered = await request(actor, `/tasks?planId=${otherPlan.id}`);
      assert.ok(filtered.status === 404 || (filtered.status === 200 && filtered.data.length === 0));
    }
    for (const actor of [admin, mentor, mentee]) {
      await denied(actor, `/plans/${foreignPlan.id}`, undefined, 'GET', [404]);
      await denied(actor, `/tasks/${foreignTask.id}`, undefined, 'GET', [404]);
      await denied(actor, `/enrollments/${foreign.enrollmentId}/task-assignees`, undefined, 'GET', [404]);
      await denied(actor, `/tasks/${foreignTask.id}/transition`, {status: 'in_progress'});
    }
    for (const assigneeId of [admin.user.id, mentor2.user.id, mentee2.user.id, foreignMentorId]) {
      assert.equal((await request(mentor, `/plans/${plan.id}/tasks`, {title: 'Responsável inválido', assigneeId, dueAt: future(), completionCriteria: 'Não pode aceitar.'})).status, 400);
    }
  });

  await t.test('restrições do PostgreSQL impedem vínculos cruzados e conclusão sem evidência', async () => {
    await assert.rejects(() => db('action_plans').insert({id: randomUUID(), organization_id: admin.user.organizationId, enrollment_id: foreign.enrollmentId, created_by: admin.user.id, title: 'Inválido', objective: 'Inválido'}), error => error.code === '23503');
    await assert.rejects(() => db('tasks').insert({id: randomUUID(), organization_id: admin.user.organizationId, enrollment_id: other.enrollmentId, plan_id: plan.id, created_by: mentor.user.id, assignee_id: mentor.user.id, title: 'Vínculo incorreto', completion_criteria: 'Verificar', due_at: future()}), error => error.code === '23503');
    await assert.rejects(() => db('tasks').insert({id: randomUUID(), organization_id: admin.user.organizationId, enrollment_id: own.enrollmentId, plan_id: plan.id, created_by: mentor.user.id, assignee_id: mentee.user.id, title: 'Sem evidência', completion_criteria: 'Verificar', due_at: future(), status: 'done', completed_at: new Date()}), error => error.code === '23514');
  });

  let task;
  await t.test('mentorado executa somente sua tarefa, bloqueia com motivo e entrega com evidência', async () => {
    task = await createTask(mentor, plan, mentee.user.id);
    const staffTask = await createTask(mentor, plan, mentor.user.id);
    await denied(mentee, `/tasks/${staffTask.id}/transition`, {status: 'in_progress'}, 'POST', [403]);
    await denied(mentee, `/tasks/${task.id}`, {assigneeId: mentor.user.id}, 'PATCH', [403]);
    await denied(mentee2, `/tasks/${task.id}/transition`, {status: 'in_progress'}, 'POST', [404]);
    await transition(mentee, task, {status: 'in_progress'});
    assert.equal((await request(mentee, `/tasks/${task.id}/transition`, {status: 'blocked'})).status, 400);
    await transition(mentee, task, {status: 'blocked', blockReason: 'Aguardando custo de frete da transportadora.'});
    await transition(mentee, task, {status: 'in_progress'});
    assert.equal((await request(mentee, `/tasks/${task.id}/transition`, {status: 'submitted'})).status, 400);
    assert.equal((await request(mentee, `/tasks/${task.id}/transition`, {status: 'submitted', evidenceText: 'Memória de cálculo.', evidenceUrl: 'http://example.test/evidencia'})).status, 400);
    await transition(mentee, task, {status: 'submitted', evidenceText: 'Primeira memória: kit R$ 80, custo total R$ 60.', evidenceUrl: 'https://example.test/evidencia'});
    await denied(mentee, `/tasks/${task.id}/transition`, {status: 'done', reviewNote: 'Não posso aprovar minha entrega.'}, 'POST', [403]);
    assert.equal((await request(mentor, `/tasks/${task.id}/transition`, {status: 'done'})).status, 400);
    await transition(mentor, task, {status: 'in_progress', reviewNote: 'Inclua a taxa de pagamento.'});
    await transition(mentee, task, {status: 'submitted', evidenceText: 'Segunda memória inclui taxa de pagamento de R$ 4.'});
    await transition(mentor, task, {status: 'done', reviewNote: 'Memória revisada com todos os custos.'});
    const detail = await ok(mentee, `/tasks/${task.id}`);
    assert.equal(detail.status, 'done');
    assert.ok(detail.completedAt);
    assert.ok(JSON.stringify(detail.history).includes('Primeira memória'));
    assert.ok(JSON.stringify(detail.history).includes('Inclua a taxa'));
    await denied(mentee, `/tasks/${task.id}/transition`, {status: 'in_progress', reason: 'Reabrir sem autorização'}, 'POST', [400, 403]);
    assert.equal((await request(mentor, `/tasks/${task.id}/transition`, {status: 'in_progress'})).status, 400);
    await transition(mentor, task, {status: 'in_progress', reason: 'Revisar novo custo do frete.'});
    assert.equal((await ok(mentor, `/tasks/${task.id}`)).completedAt, null);
  });

  await t.test('progresso exclui canceladas, fechamento exige término e reabertura tem motivo', async () => {
    const p = await createPlan(mentor, own, 'progresso');
    assert.equal((await request(mentor, `/plans/${p.id}`, {status: 'completed'}, 'PATCH')).status, 400);
    const a = await createTask(mentor, p, mentor.user.id), b = await createTask(mentor, p, mentor.user.id), c = await createTask(mentor, p, mentee.user.id);
    await transition(mentor, a, {status: 'in_progress'});
    await transition(mentor, a, {status: 'done', evidenceText: 'Cálculo do primeiro kit conferido.'});
    await transition(mentor, c, {status: 'cancelled', reason: 'Kit saiu de linha.'});
    assert.equal((await ok(mentor, `/plans/${p.id}`)).progressPercent, 50);
    assert.equal((await request(mentor, `/plans/${p.id}`, {status: 'completed'}, 'PATCH')).status, 400);
    await transition(mentor, b, {status: 'in_progress'});
    await transition(mentor, b, {status: 'done', evidenceText: 'Cálculo do segundo kit conferido.'});
    assert.equal((await ok(mentor, `/plans/${p.id}`)).progressPercent, 100);
    await ok(mentor, `/plans/${p.id}`, {status: 'completed'}, 'PATCH');
    assert.equal((await request(mentor, `/plans/${p.id}/tasks`, {title: 'Plano encerrado', assigneeId: mentor.user.id, dueAt: future(), completionCriteria: 'Verificar'})).status, 400);
    assert.equal((await request(mentor, `/plans/${p.id}`, {status: 'active'}, 'PATCH')).status, 400);
    await ok(mentor, `/plans/${p.id}`, {status: 'active', reason: 'Novo ciclo de revisão.'}, 'PATCH');
    const cancelledPlan = await createPlan(mentor, own, 'canceladas');
    const cancelledTask = await createTask(mentor, cancelledPlan, mentor.user.id);
    await transition(mentor, cancelledTask, {status: 'cancelled', reason: 'Escopo removido com justificativa.'});
    assert.equal((await ok(mentor, `/plans/${cancelledPlan.id}`)).progressPercent, null);
  });

  await t.test('aprovar e devolver a mesma entrega simultaneamente produz uma única revisão', async () => {
    const item = await createTask(mentor, plan, mentee.user.id);
    await transition(mentee, item, {status: 'in_progress'});
    await transition(mentee, item, {status: 'submitted', evidenceText: 'Evidência para revisão concorrente.'});
    const beforeHistory = (await ok(mentor, `/tasks/${item.id}`)).history.length;
    const results = await Promise.all([
      request(mentor, `/tasks/${item.id}/transition`, {status: 'done', reviewNote: 'Conferido.'}),
      request(mentor, `/tasks/${item.id}/transition`, {status: 'in_progress', reviewNote: 'Rever o frete.'}),
    ]);
    assert.equal(results.filter(result => result.status >= 200 && result.status < 300).length, 1, JSON.stringify(results));
    assert.equal(results.filter(result => [400, 409].includes(result.status)).length, 1);
    const detail = await ok(mentor, `/tasks/${item.id}`);
    assert.equal(detail.history.length, beforeHistory + 1);
    assert.ok(['done', 'in_progress'].includes(detail.status));
  });

  await t.test('fechar plano e criar tarefa simultaneamente não deixa plano concluído com trabalho aberto', async () => {
    const p = await createPlan(mentor, own, 'fechamento concorrente');
    const item = await createTask(mentor, p, mentor.user.id);
    await transition(mentor, item, {status: 'done', evidenceText: 'Entrega inicial conferida.'});
    const results = await Promise.all([
      request(mentor, `/plans/${p.id}`, {status: 'completed'}, 'PATCH'),
      request(mentor, `/plans/${p.id}/tasks`, {title: 'Nova tarefa concorrente', assigneeId: mentor.user.id, dueAt: future(), completionCriteria: 'Conferir a nova tarefa.'}),
    ]);
    assert.equal(results.filter(result => result.status >= 200 && result.status < 300).length, 1, JSON.stringify(results));
    assert.equal(results.filter(result => [400, 409].includes(result.status)).length, 1);
    const detail = await ok(mentor, `/plans/${p.id}`);
    assert.ok(detail.status !== 'completed' || detail.tasks.every(value => ['done', 'cancelled'].includes(value.status)));
  });

  await t.test('retirar autorização da empresa revoga planos e tarefas do mentorado imediatamente', async () => {
    const item = await createTask(mentor, plan, mentee.user.id);
    await db('client_members').where({client_id: own.id, user_id: mentee.user.id}).delete();
    try {
      for (const path of [`/plans/${plan.id}`, `/tasks/${item.id}`, `/enrollments/${own.enrollmentId}/task-assignees`]) await denied(mentee, path, undefined, 'GET', [404]);
      await denied(mentee, `/tasks/${item.id}/transition`, {status: 'in_progress'}, 'POST', [404]);
      assert.ok(!(await ok(mentee, '/plans')).some(value => value.id === plan.id));
      assert.ok(!(await ok(mentee, '/tasks')).some(value => value.id === item.id));
      assert.equal((await ok(mentor, `/tasks/${item.id}`)).assigneeHasAccess, false);
      assert.ok((await ok(admin, '/dashboard')).attention.some(value => value.type === 'orphan_task' && value.taskId === item.id));
    } finally {
      await db('client_members').insert({organization_id: admin.user.organizationId, client_id: own.id, user_id: mentee.user.id});
    }
  });

  await t.test('troca de mentor e expiração de cobertura revogam planos, tarefas e responsáveis', async () => {
    const staffTask = await createTask(mentor, plan, mentor.user.id);
    const before = await ok(admin, `/tasks/${staffTask.id}`);
    await ok(admin, `/enrollments/${own.enrollmentId}/assignments`, {mentorId: mentor2.user.id, kind: 'primary'});
    for (const path of [`/plans/${plan.id}`, `/tasks/${staffTask.id}`, `/enrollments/${own.enrollmentId}/task-assignees`]) await denied(mentor, path, undefined, 'GET', [404]);
    await denied(mentor, `/tasks/${staffTask.id}/transition`, {status: 'in_progress'}, 'POST', [404]);
    const after = await ok(mentor2, `/tasks/${staffTask.id}`);
    assert.equal(after.assigneeHasAccess, false);
    assert.equal(after.history.length, before.history.length);
    assert.ok((await ok(mentor2, '/dashboard')).attention.some(value => value.type === 'orphan_task' && value.taskId === staffTask.id));
    await ok(admin, `/enrollments/${own.enrollmentId}/assignments`, {mentorId: mentor.user.id, kind: 'coverage', endsAt: future()});
    assert.equal((await request(mentor, `/plans/${plan.id}`)).status, 200);
    await db('assignments').where({enrollment_id: own.enrollmentId, mentor_id: mentor.user.id, kind: 'coverage'}).update({starts_at: past(1), ends_at: new Date(Date.now() - 1000)});
    await denied(mentor, `/plans/${plan.id}`, undefined, 'GET', [404]);
    assert.ok(!(await ok(mentor2, `/enrollments/${own.enrollmentId}/task-assignees`)).some(user => user.id === mentor.user.id));
    await ok(admin, `/enrollments/${own.enrollmentId}/assignments`, {mentorId: mentor.user.id, kind: 'primary'});
  });

  await t.test('painel aponta ausência, estagnação, atraso e revisão com caminhos acionáveis', async () => {
    const program = (await ok(admin, '/programs'))[0];
    const c = await fixtureClient(admin, program.id, mentor.user.id, mentee.user.id, 'Sinais operacionais');
    const draft = await createPlan(mentor, c, 'rascunho');
    await ok(mentor, `/plans/${draft.id}`, {status: 'draft'}, 'PATCH');
    let dashboard = await ok(mentor, '/dashboard');
    let signal = dashboard.attention.find(value => value.type === 'missing_plan' && value.enrollmentId === c.enrollmentId);
    assert.ok(signal);
    assert.ok(signal.actionUrl.includes(c.enrollmentId));
    assert.ok(dashboard.stats.clientsWithoutPlan >= 1);
    await ok(mentor, `/plans/${draft.id}`, {status: 'active'}, 'PATCH');
    await db('action_plans').where({id: draft.id}).update({last_progress_at: past(10)});
    const beforeDate = (await db('action_plans').where({id: draft.id}).first()).last_progress_at;
    await ok(mentor, `/plans/${draft.id}`, {title: 'Editar título não constitui progresso'}, 'PATCH');
    assert.equal(new Date((await db('action_plans').where({id: draft.id}).first()).last_progress_at).getTime(), new Date(beforeDate).getTime());
    dashboard = await ok(mentor, '/dashboard');
    assert.ok(!dashboard.attention.some(value => value.type === 'missing_plan' && value.enrollmentId === c.enrollmentId));
    signal = dashboard.attention.find(value => value.type === 'stalled_plan' && value.planId === draft.id);
    assert.equal(signal.actionUrl, `/plans/${draft.id}`);
    const item = await createTask(mentor, draft, mentee.user.id);
    await transition(mentee, item, {status: 'in_progress'});
    await transition(mentee, item, {status: 'blocked', blockReason: 'Transportadora ainda não respondeu.'});
    await db('tasks').where({id: item.id}).update({due_at: past(1)});
    dashboard = await ok(admin, '/dashboard');
    for (const type of ['overdue_task', 'blocked_task']) {
      signal = dashboard.attention.find(value => value.type === type && value.taskId === item.id);
      assert.ok(signal);
      assert.equal(signal.planId, draft.id);
      assert.equal(signal.actionUrl, `/tasks/${item.id}`);
    }
    assert.ok(dashboard.stats.overdueTasks >= 1 && dashboard.stats.blockedTasks >= 1);
    assert.ok(!(await ok(mentor2, '/dashboard')).attention.some(value => value.taskId === item.id));
    await transition(mentee, item, {status: 'in_progress'});
    await transition(mentee, item, {status: 'submitted', evidenceText: 'Transportadora respondeu, cálculo atualizado e entregue.'});
    dashboard = await ok(admin, '/dashboard');
    assert.ok(dashboard.attention.some(value => value.type === 'pending_review' && value.taskId === item.id));
    assert.ok(!dashboard.attention.some(value => ['overdue_task', 'blocked_task'].includes(value.type) && value.taskId === item.id));
    assert.ok(!dashboard.attention.some(value => value.type === 'stalled_plan' && value.planId === draft.id));
    assert.ok(dashboard.stats.pendingTaskReviews >= 1);
    await db('enrollments').where({id: c.enrollmentId}).update({status: 'paused'});
    assert.ok(!(await ok(admin, '/dashboard')).attention.some(value => value.type && value.enrollmentId === c.enrollmentId));
  });

  await t.test('alertas persistidos deduplicam concorrência e abrem novo episódio após correção', async () => {
    const p = await createPlan(mentor, own, 'episódios de alerta');
    const item = await createTask(mentor, p, mentee.user.id);
    await db('tasks').where({id: item.id}).update({due_at: past(1)});
    await Promise.all([cli('reconcile'), cli('reconcile')]);
    const key = `overdue_task:${item.id}`;
    const count = async () => Number((await db('notifications').where({task_id: item.id}).where('dedupe_key', 'like', `action:${key}:%`).count('* as n').first()).n);
    const initial = await count();
    assert.equal(initial, 3, 'Administrador, mentor vigente e mentorado responsável devem ser avisados.');
    await cli('reconcile');
    assert.equal(await count(), initial);
    let state = await db('action_signal_states').where({organization_id: admin.user.organizationId, signal_key: key}).first();
    assert.equal(state.episode, 1);
    assert.equal(state.active, true);
    await ok(mentor, `/tasks/${item.id}`, {title: 'Renomear tarefa não reinicia alerta'}, 'PATCH');
    await cli('reconcile');
    assert.equal(await count(), initial);
    await ok(mentor, `/tasks/${item.id}`, {dueAt: future()}, 'PATCH');
    await cli('reconcile');
    state = await db('action_signal_states').where({organization_id: admin.user.organizationId, signal_key: key}).first();
    assert.equal(state.active, false);
    assert.ok(state.cleared_at);
    await db('tasks').where({id: item.id}).update({due_at: past(1)});
    await cli('reconcile');
    assert.equal(await count(), initial * 2);
    state = await db('action_signal_states').where({organization_id: admin.user.organizationId, signal_key: key}).first();
    assert.equal(state.episode, 2);
    await transition(mentee, item, {status: 'in_progress'});
    await transition(mentee, item, {status: 'submitted', evidenceText: 'Evidência entregue para revisão.'});
    await cli('reconcile');
    assert.equal(Number((await db('notifications').where({task_id: item.id, user_id: mentee.user.id}).where('dedupe_key', 'like', `action:pending_review:${item.id}:%`).count('* as n').first()).n), 0);
    assert.equal(Number((await db('notifications').where({task_id: item.id, user_id: mentor2.user.id}).count('* as n').first()).n), 0);
    assert.ok((await ok(mentor, '/notifications')).some(value => value.taskId === item.id && value.planId === p.id));
  });
});

after(async () => {
  if (server && server.exitCode === null) {
    server.kill();
    await new Promise(resolve => { server.once('exit', resolve); const timer = setTimeout(resolve, 3000); timer.unref(); });
  }
  if (db) await db.destroy();
});
