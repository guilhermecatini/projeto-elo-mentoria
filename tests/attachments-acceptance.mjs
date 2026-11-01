import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {config} from 'dotenv';
import knex from 'knex';
import {randomUUID, createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {resolve, join, relative, sep} from 'node:path';
import {mkdir, readdir, readFile, writeFile, rename, unlink, stat, utimes} from 'node:fs/promises';
import {textBytes, csvBytes, pngBytes, pdfBytes} from './fixtures/attachment-samples.mjs';

config({quiet: true});
const database = 'elo_filescheck', origin = 'http://localhost:3337', runId = randomUUID();
const uploadRoot = resolve('.local/file-test/elo_filescheck');
assert.ok(uploadRoot.startsWith(resolve('.local/file-test') + sep));
const ownerBase = `postgresql://elo_owner:${process.env.DB_OWNER_PASSWORD}@127.0.0.1:55432/`;
const env = {...process.env, NODE_ENV: 'development', PORT: '3337', APP_ORIGIN: origin, UPLOAD_DIR: uploadRoot,
  DATABASE_URL: `postgresql://elo_app:${process.env.DB_APP_PASSWORD}@127.0.0.1:55432/${database}`,
  MIGRATION_DATABASE_URL: ownerBase + database, REDIS_URL: `redis://:${process.env.REDIS_PASSWORD}@127.0.0.1:56379/4`};
let db, server, admin, mentor, mentor2, mentee, mentee2, foreignAdmin;
let own, other, ticket, firstMessage, note, otherTicket, otherMessage, foreignTicket, foreignMessage, plan, task, staffTask, publicFile, internalFile;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const future = () => new Date(Date.now() + 86400e3).toISOString();
const past = () => new Date(Date.now() - 2 * 3600e3);

function cli(command) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, ['apps/api/dist/cli.js', command], {env, stdio: ['ignore', 'ignore', 'ignore']});
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolvePromise() : reject(new Error(`CLI ${command} falhou (${code}).`)));
  });
}
async function startApi() {
  server = spawn(process.execPath, ['apps/api/dist/main.js'], {env, stdio: ['ignore', 'ignore', 'ignore']});
  for (let attempt = 0; attempt < 80; attempt++) {
    if (server.exitCode !== null) throw new Error('API de arquivos terminou antes da prontidão.');
    try { if ((await fetch(origin + '/api/health/live')).ok) return; } catch {}
    await new Promise(resolvePromise => setTimeout(resolvePromise, 150));
  }
  throw new Error('API de arquivos não iniciou.');
}
async function stopApi() {
  if (server && server.exitCode === null) {
    server.kill();
    await new Promise(resolvePromise => { server.once('exit', resolvePromise); const timer = setTimeout(resolvePromise, 3000); timer.unref(); });
  }
}
function headers(session, extra = {}) {
  return {Origin: origin, ...(session ? {Cookie: session.cookie, 'X-CSRF-Token': session.csrfToken} : {}), ...extra};
}
async function json(session, path, body, method = body === undefined ? 'GET' : 'POST') {
  const response = await fetch(origin + '/api' + path, {method, headers: headers(session, {'Content-Type': 'application/json'}), ...(body === undefined ? {} : {body: JSON.stringify(body)})});
  return {status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0]};
}
async function ok(session, path, body, method) {
  const result = await json(session, path, body, method);
  assert.ok(result.status >= 200 && result.status < 300, `${path}: ${result.status} ${JSON.stringify(result.data)}`);
  return result.data;
}
async function signin(email) {
  const result = await json(null, '/auth/login', {email, password: process.env.DEMO_PASSWORD});
  assert.equal(result.status, 201, JSON.stringify(result.data));
  return {...result.data, cookie: result.cookie};
}
async function upload(session, path, bytes = textBytes, name = 'custos.txt', mime = 'text/plain', extraHeaders = {}, field = 'file') {
  const form = new FormData();
  form.append(field, new Blob([bytes], {type: mime}), name);
  const response = await fetch(origin + '/api' + path, {method: 'POST', headers: headers(session, extraHeaders), body: form});
  return {status: response.status, data: await response.json()};
}
async function uploaded(session, path, bytes, name, mime, extraHeaders) {
  const result = await upload(session, path, bytes, name, mime, extraHeaders);
  assert.ok(result.status >= 200 && result.status < 300, `${path}: ${result.status} ${JSON.stringify(result.data)}`);
  assert.ok(result.data.id);
  return result.data;
}
async function download(session, id) {
  const response = await fetch(origin + `/api/attachments/${id}/download`, {headers: headers(session)});
  return {status: response.status, headers: response.headers, bytes: Buffer.from(await response.arrayBuffer())};
}
const messagePath = (t, m) => `/tickets/${t.id}/messages/${m.id}/attachments`;
async function createTicket(actor, enrollmentId, label) {
  const result = await ok(actor, '/tickets', {enrollmentId, subject: `Arquivos ${label} ${runId}`, description: 'Confira o arquivo de evidência associado a esta dúvida.', priority: 'standard'});
  const detail = await ok(actor, `/tickets/${result.id}`);
  return [result, detail.messages[0]];
}
async function client(actor, programId, mentorId, memberId, label) {
  const result = await ok(actor, '/clients', {name: `${label} ${runId}`, contactName: 'Teste de arquivos privados', email: `${randomUUID()}@files.test`, programId, mentorId});
  if (memberId) await db('client_members').insert({organization_id: actor.user.organizationId, client_id: result.id, user_id: memberId});
  return result;
}
async function files(directory = uploadRoot) {
  let entries;
  try { entries = await readdir(directory, {withFileTypes: true}); } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const result = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await files(path));
    else result.push(relative(uploadRoot, path));
  }
  return result.sort();
}
async function snapshot() { return {files: await files(), ready: Number((await db('attachments').where({status: 'ready'}).count('* as n').first()).n)}; }

before(async () => {
  assert.ok(process.env.DEMO_PASSWORD?.length >= 12);
  await new Promise((resolvePromise, reject) => {
    const probe = createServer(); probe.once('error', () => reject(new Error('Porta 3337 ocupada; não reutilizar API existente.')));
    probe.listen(3337, '127.0.0.1', () => probe.close(resolvePromise));
  });
  const connection = knex({client: 'pg', connection: ownerBase + 'postgres'});
  try { if (!(await connection('pg_database').where({datname: database}).first())) await connection.raw('CREATE DATABASE elo_filescheck OWNER elo_owner'); }
  finally { await connection.destroy(); }
  db = knex({client: 'pg', connection: ownerBase + database});
  await mkdir(uploadRoot, {recursive: true});
  await cli('migrate'); await cli('seed'); await startApi();
  const seedAdmin = await db('users').where({email: 'admin@demo.local'}).first();
  const accounts = ['admin', 'mentor', 'mentor2', 'mentee', 'mentee2'].map(label => ({
    id: randomUUID(), organization_id: seedAdmin.organization_id, name: `Teste ${label}`,
    email: `${label}-${runId}@attachment.test`, role: label.replace('2', ''), password_hash: seedAdmin.password_hash,
  }));
  await db('users').insert(accounts);
  [admin, mentor, mentor2, mentee, mentee2] = await Promise.all(accounts.map(account => signin(account.email)));
  const program = (await ok(admin, '/programs'))[0];
  own = await client(admin, program.id, mentor.user.id, mentee.user.id, 'Arquivos próprios');
  other = await client(admin, program.id, mentor2.user.id, mentee2.user.id, 'Arquivos outra carteira');
  [ticket, firstMessage] = await createTicket(mentee, own.enrollmentId, 'público');
  note = await ok(mentor, `/tickets/${ticket.id}/messages`, {body: 'Nota interna reservada à equipe.', kind: 'internal'});
  [otherTicket, otherMessage] = await createTicket(mentee2, other.enrollmentId, 'outra carteira');
  const orgId = randomUUID(), foreignAdminId = randomUUID(), foreignMentorId = randomUUID(), programId = randomUUID(), email = `${runId}@foreign-files.test`;
  const passwordHash = (await db('users').where({id: admin.user.id}).first()).password_hash;
  await db.transaction(async trx => {
    await trx('organizations').insert({id: orgId, name: 'Arquivos de outra organização'});
    await trx('users').insert([{id: foreignAdminId, organization_id: orgId, name: 'Admin externo', email, role: 'admin', password_hash: passwordHash}, {id: foreignMentorId, organization_id: orgId, name: 'Mentor externo', email: `${randomUUID()}@foreign-files.test`, role: 'mentor', password_hash: passwordHash}]);
    await trx('programs').insert({id: programId, organization_id: orgId, name: 'Programa externo', calendar: JSON.stringify({timezone: 'America/Sao_Paulo', days: [1, 2, 3, 4, 5], startHour: 9, endHour: 18, holidays: []})});
  });
  foreignAdmin = await signin(email);
  const foreign = await client(foreignAdmin, programId, foreignMentorId, null, 'Arquivos outra organização');
  [foreignTicket, foreignMessage] = await createTicket(foreignAdmin, foreign.enrollmentId, 'estrangeiro');
  plan = await ok(mentor, '/plans', {enrollmentId: own.enrollmentId, title: 'Evidências anexadas', objective: 'Conferir custos e margem.'});
  const taskInput = {title: 'Anexar memória de custos', dueAt: future(), completionCriteria: 'Evidência textual e memória de cálculo coerentes.'};
  task = await ok(mentor, `/plans/${plan.id}/tasks`, {...taskInput, assigneeId: mentee.user.id});
  staffTask = await ok(mentor, `/plans/${plan.id}/tasks`, {...taskInput, assigneeId: mentor.user.id});
});

test('Anexos privados: isolamento, integridade, limites, falhas e recuperação', async t => {
  await t.test('mentorado envia documento real sem responder dúvida ou alterar prazo', async () => {
    const before = await ok(mentee, `/tickets/${ticket.id}`);
    publicFile = await uploaded(mentee, messagePath(ticket, firstMessage), pdfBytes, 'memória de cálculo.pdf', 'application/pdf');
    assert.equal(publicFile.originalName, 'memória de cálculo.pdf');
    assert.equal(publicFile.mimeType, 'application/pdf');
    assert.equal(Number(publicFile.sizeBytes), pdfBytes.length);
    assert.equal(publicFile.visibility, 'public');
    assert.equal(publicFile.messageId, firstMessage.id);
    assert.equal(publicFile.createdById, mentee.user.id);
    assert.ok(!JSON.stringify(publicFile).includes('storage_key'));
    assert.ok(!JSON.stringify(publicFile).includes(uploadRoot));
    const after = await ok(mentee, `/tickets/${ticket.id}`);
    for (const key of ['status', 'firstResponseDueAt', 'nextResponseDueAt', 'unansweredCount']) assert.deepEqual(after[key], before[key]);
    assert.deepEqual(after.slaEvents, before.slaEvents);
    for (const actor of [admin, mentor, mentee]) {
      const list = await ok(actor, `/tickets/${ticket.id}/attachments`);
      assert.ok(list.some(value => value.id === publicFile.id));
      const response = await download(actor, publicFile.id);
      assert.equal(response.status, 200);
      assert.equal(digest(response.bytes), digest(pdfBytes));
      assert.match(response.headers.get('content-disposition'), /^attachment;/);
      assert.match(response.headers.get('cache-control'), /no-store/);
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    }
    const row = await db('attachments').where({id: publicFile.id}).first();
    assert.equal(row.status, 'ready'); assert.equal(row.sha256, digest(pdfBytes));
    assert.equal(digest(await readFile(join(uploadRoot, 'objects', `${row.storage_key}.bin`))), row.sha256);
  });

  await t.test('nota interna e nome do anexo nunca vazam ao mentorado', async () => {
    const name = `administracao-confidencial-${runId}.txt`;
    internalFile = await uploaded(mentor, messagePath(ticket, note), Buffer.from('Avaliação interna restrita.'), name, 'text/plain');
    assert.equal(internalFile.visibility, 'internal');
    for (const actor of [admin, mentor]) assert.equal((await download(actor, internalFile.id)).status, 200);
    assert.equal((await download(mentee, internalFile.id)).status, 404);
    for (const path of [`/tickets/${ticket.id}/attachments`, `/tickets/${ticket.id}`, `/clients/${own.id}`, '/notifications', '/dashboard']) {
      const view = JSON.stringify(await ok(mentee, path));
      assert.ok(!view.includes(name), path); assert.ok(!view.includes(internalFile.id), path);
    }
    assert.equal((await upload(mentee, messagePath(ticket, note))).status, 404);
    assert.ok([403, 404].includes((await upload(admin, messagePath(ticket, firstMessage))).status));
    assert.ok([403, 404].includes((await upload(mentor, messagePath(ticket, firstMessage))).status));
    await db('messages').where({id: firstMessage.id}).update({kind: 'internal'});
    try {
      assert.ok(!(await ok(mentee, `/tickets/${ticket.id}/attachments`)).some(value => value.id === publicFile.id));
      assert.equal((await download(mentee, publicFile.id)).status, 404);
    } finally { await db('messages').where({id: firstMessage.id}).update({kind: 'public'}); }
  });

  await t.test('outra carteira, outra organização, IDs adulterados e sessão ausente são negados antes do arquivo', async () => {
    const before = await snapshot();
    for (const actor of [mentor2, mentee2, foreignAdmin]) {
      assert.equal((await json(actor, `/tickets/${ticket.id}/attachments`)).status, 404);
      assert.equal((await download(actor, publicFile.id)).status, 404);
      assert.equal((await upload(actor, messagePath(ticket, firstMessage))).status, 404);
    }
    const outside = await uploaded(mentee2, messagePath(otherTicket, otherMessage), Buffer.from('Outra carteira.'), 'outra.txt', 'text/plain');
    const alien = await uploaded(foreignAdmin, messagePath(foreignTicket, foreignMessage), Buffer.from('Outra organização.'), 'externa.txt', 'text/plain');
    for (const actor of [mentor, mentee]) assert.equal((await download(actor, outside.id)).status, 404);
    for (const actor of [admin, mentor, mentee]) assert.equal((await download(actor, alien.id)).status, 404);
    assert.equal((await upload(mentee, `/tickets/${ticket.id}/messages/${otherMessage.id}/attachments`)).status, 404);
    assert.equal((await download(null, publicFile.id)).status, 401);
    assert.equal((await upload(null, messagePath(ticket, firstMessage), Buffer.alloc(11 * 1024 * 1024), 'grande.txt', 'text/plain')).status, 401);
    assert.equal((await download(mentee, randomUUID())).status, 404);
    assert.equal((await download(mentee, 'nao-e-uuid')).status, 400);
    const after = await snapshot(); assert.equal(after.ready, before.ready + 2);
  });

  await t.test('TXT, CSV e PNG válidos, deduplicação e chave idempotente preservam uma única gravação', async () => {
    const txt = await uploaded(mentee, messagePath(ticket, firstMessage), textBytes, 'custos.txt', 'text/plain');
    const again = await uploaded(mentee, messagePath(ticket, firstMessage), textBytes, 'outro-nome.txt', 'text/plain');
    assert.equal(again.id, txt.id);
    const key = randomUUID();
    const csv = await uploaded(mentee, messagePath(ticket, firstMessage), csvBytes, 'metricas.csv', 'text/csv', {'Idempotency-Key': key});
    const repeated = await uploaded(mentee, messagePath(ticket, firstMessage), csvBytes, 'metricas.csv', 'text/csv', {'Idempotency-Key': key});
    assert.equal(repeated.id, csv.id);
    const conflict = await upload(mentee, messagePath(ticket, firstMessage), Buffer.from('coluna\nnovo\n'), 'metricas.csv', 'text/csv', {'Idempotency-Key': key});
    assert.ok([400, 409].includes(conflict.status));
    const image = await uploaded(mentee, messagePath(ticket, firstMessage), pngBytes, 'pixel.png', 'image/png');
    assert.equal(digest((await download(mentee, image.id)).bytes), digest(pngBytes));
  });

  await t.test('arquivo vazio, grande, MIME/extensão falsa e conteúdo ativo são recusados sem resíduos', async () => {
    const before = await snapshot();
    const invalid = [
      [Buffer.alloc(0), 'vazio.txt', 'text/plain'],
      [Buffer.alloc(10 * 1024 * 1024 + 1, 65), 'grande.txt', 'text/plain'],
      [textBytes, 'imagem.png', 'image/png'],
      [pngBytes, 'imagem.jpg', 'image/jpeg'],
      [textBytes, 'programa.exe', 'application/octet-stream'],
      [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'vetor.svg', 'image/svg+xml'],
      [Buffer.from('<!doctype html><html><script>alert(1)</script></html>'), 'pagina.txt', 'text/plain'],
      [Buffer.from([65, 0, 66]), 'binario.txt', 'text/plain'],
      [Buffer.from('%PDF-1.4 incompleto'), 'falso.pdf', 'application/pdf'],
    ];
    for (const [bytes, name, mime] of invalid) {
      const result = await upload(mentee, messagePath(ticket, firstMessage), bytes, name, mime);
      assert.ok([400, 413, 415].includes(result.status), `${name}: ${result.status}`);
    }
    const field = await upload(mentee, messagePath(ticket, firstMessage), textBytes, 'campo.txt', 'text/plain', {}, 'unexpected');
    assert.ok([400, 413].includes(field.status));
    assert.deepEqual(await snapshot(), before);
  });

  await t.test('CSRF, origem indevida e nome com travessia não criam caminhos públicos', async () => {
    const before = await snapshot();
    assert.equal((await upload({...mentee, csrfToken: 'incorreto'}, messagePath(ticket, firstMessage))).status, 403);
    assert.equal((await upload(mentee, messagePath(ticket, firstMessage), textBytes, 'origem.txt', 'text/plain', {Origin: 'https://untrusted.test'})).status, 403);
    assert.deepEqual(await snapshot(), before);
    const result = await upload(mentee, messagePath(ticket, firstMessage), Buffer.from('Nome não é caminho de armazenamento.'), '../../pasta/segredo.txt', 'text/plain');
    assert.ok([200, 201, 400].includes(result.status));
    if (result.status < 300) {
      assert.ok(!/[\\/\r\n]/.test(result.data.originalName));
      const row = await db('attachments').where({id: result.data.id}).first();
      assert.match(row.storage_key, /^[0-9a-f-]{36}$/);
      assert.ok(!row.storage_key.includes('segredo'));
      assert.equal((await download(mentee, result.data.id)).status, 200);
    }
    assert.equal((await fetch(origin + '/uploads/segredo.txt')).status, 404);
    assert.equal((await fetch(origin + '/objects/' + publicFile.id + '.bin')).status, 404);
  });

  let taskFile;
  await t.test('anexo de tarefa exige dono autorizado e não substitui entrega nem progresso', async () => {
    const before = await ok(mentor, `/plans/${plan.id}`);
    taskFile = await uploaded(mentee, `/tasks/${task.id}/attachments`, csvBytes, 'memoria-tarefa.csv', 'text/csv');
    assert.equal(taskFile.taskId, task.id);
    assert.equal((await ok(mentee, `/tasks/${task.id}`)).status, 'todo');
    assert.equal((await ok(mentor, `/plans/${plan.id}`)).lastProgressAt, before.lastProgressAt);
    assert.equal((await json(mentee, `/tasks/${task.id}/transition`, {status: 'submitted'})).status, 400);
    assert.ok((await ok(mentee, `/tasks/${task.id}/attachments`)).some(value => value.id === taskFile.id));
    assert.ok([403, 404].includes((await upload(mentee, `/tasks/${staffTask.id}/attachments`)).status));
    assert.equal((await upload(mentee2, `/tasks/${task.id}/attachments`)).status, 404);
    assert.equal((await upload(mentor2, `/tasks/${task.id}/attachments`)).status, 404);
    await ok(mentee, `/tasks/${task.id}/transition`, {status: 'submitted', evidenceText: 'Memória de cálculo anexada e validada por mim.'});
    const immutable = await snapshot();
    for (const actor of [admin, mentor, mentee]) assert.ok([400, 403, 409].includes((await upload(actor, `/tasks/${task.id}/attachments`, Buffer.from('Não deve modificar entrega.'))).status));
    assert.deepEqual(await snapshot(), immutable);
    await ok(mentor, `/tasks/${task.id}/transition`, {status: 'done', reviewNote: 'Evidência conferida.'});
    assert.ok([400, 403, 409].includes((await upload(mentee, `/tasks/${task.id}/attachments`)).status));
    assert.equal(digest((await download(mentee, taskFile.id)).bytes), digest(csvBytes));
    await ok(mentor, `/tasks/${staffTask.id}/transition`, {status: 'cancelled', reason: 'Escopo retirado.'});
    assert.ok([400, 403, 409].includes((await upload(mentor, `/tasks/${staffTask.id}/attachments`)).status));
  });

  await t.test('troca de mentor, cobertura expirada e logout revogam download imediatamente', async () => {
    await ok(admin, `/enrollments/${own.enrollmentId}/assignments`, {mentorId: mentor2.user.id, kind: 'primary'});
    assert.equal((await download(mentor, publicFile.id)).status, 404);
    assert.equal((await download(mentor, internalFile.id)).status, 404);
    assert.equal((await download(mentor2, publicFile.id)).status, 200);
    assert.equal((await download(mentor2, internalFile.id)).status, 200);
    await ok(admin, `/enrollments/${own.enrollmentId}/assignments`, {mentorId: mentor.user.id, kind: 'coverage', endsAt: future()});
    assert.equal((await download(mentor, publicFile.id)).status, 200);
    await db('assignments').where({enrollment_id: own.enrollmentId, mentor_id: mentor.user.id, kind: 'coverage'}).update({starts_at: past(), ends_at: new Date(Date.now() - 1000)});
    assert.equal((await download(mentor, publicFile.id)).status, 404);
    await ok(admin, `/enrollments/${own.enrollmentId}/assignments`, {mentorId: mentor.user.id, kind: 'primary'});
    const session = await signin(mentee.user.email);
    assert.equal((await download(session, publicFile.id)).status, 200);
    await ok(session, '/auth/logout', {});
    assert.equal((await download(session, publicFile.id)).status, 401);
  });

  await t.test('atendimento resolvido, contrato pausado e plano em rascunho impedem novos anexos', async () => {
    const [closed, message] = await createTicket(mentee, own.enrollmentId, 'resolvido');
    await db('tickets').where({id: closed.id}).update({status: 'resolved', resolution_summary: 'Assunto encerrado para teste de imutabilidade.'});
    let before = await snapshot();
    assert.ok([400, 403, 409].includes((await upload(mentee, messagePath(closed, message))).status));
    assert.deepEqual(await snapshot(), before);
    const openTask = await ok(mentor, `/plans/${plan.id}/tasks`, {title: 'Verificar contratação pausada', assigneeId: mentee.user.id, dueAt: future(), completionCriteria: 'Verificar estado de contratação.'});
    await ok(admin, `/enrollments/${own.enrollmentId}`, {expectedVersion: (await ok(admin, `/journey/enrollments/${own.enrollmentId}`)).journeyVersion, status: 'paused', reason: 'Pausa controlada para teste de anexos.'}, 'PATCH');
    try {
      before = await snapshot();
      assert.ok([400, 403, 409].includes((await upload(mentee, `/tasks/${openTask.id}/attachments`)).status));
      assert.equal((await download(mentee, publicFile.id)).status, 200);
      assert.deepEqual(await snapshot(), before);
    } finally { await ok(admin, `/enrollments/${own.enrollmentId}`, {expectedVersion: (await ok(admin, `/journey/enrollments/${own.enrollmentId}`)).journeyVersion, status: 'active', reason: 'Ensaio de pausa concluído.'}, 'PATCH'); }
    await ok(mentor, `/plans/${plan.id}`, {status: 'draft'}, 'PATCH');
    try { assert.ok([400, 403, 409].includes((await upload(mentee, `/tasks/${openTask.id}/attachments`)).status)); }
    finally { await ok(mentor, `/plans/${plan.id}`, {status: 'active'}, 'PATCH'); }
  });

  await t.test('limite de 20 anexos por atendimento resiste a envios concorrentes de autores distintos', async () => {
    const [limited, initial] = await createTicket(mentee, own.enrollmentId, 'limite concorrente');
    const reply = await ok(mentor, `/tickets/${limited.id}/messages`, {body: 'Envie também o comprovante de custo.', kind: 'public'});
    for (let index = 0; index < 19; index++) await uploaded(mentee, messagePath(limited, initial), Buffer.from(`Custo distinto ${index} ${runId}.`), `custo-${index}.txt`, 'text/plain');
    const results = await Promise.all([
      upload(mentee, messagePath(limited, initial), Buffer.from('Vigésimo candidato do mentorado.'), 'mentorado.txt', 'text/plain'),
      upload(mentor, messagePath(limited, reply), Buffer.from('Vigésimo candidato do mentor.'), 'mentor.txt', 'text/plain'),
    ]);
    assert.equal(results.filter(value => value.status >= 200 && value.status < 300).length, 1, JSON.stringify(results));
    assert.equal(results.filter(value => [400, 409, 413].includes(value.status)).length, 1);
    const rows = await db('attachments').where({ticket_id: limited.id}).whereIn('status', ['pending', 'ready']);
    assert.equal(rows.length, 20);
    assert.ok(rows.every(row => row.status === 'ready'));
    assert.equal((await ok(mentee, `/tickets/${limited.id}/attachments`)).length, 20);
    for (const row of rows) assert.equal(digest(await readFile(join(uploadRoot, 'objects', `${row.storage_key}.bin`))), row.sha256);
  });

  await t.test('falha de gravação não publica metadado pronto nem deixa arquivo temporário', async () => {
    const objects = join(uploadRoot, 'objects'), saved = join(uploadRoot, `objects-saved-${runId}`);
    assert.equal(relative(uploadRoot, objects), 'objects');
    const before = await snapshot();
    await rename(objects, saved);
    try {
      await writeFile(objects, 'Arquivo temporário para simular falha de diretório.');
      const failed = await upload(mentee, messagePath(ticket, firstMessage), Buffer.from(`Falha controlada ${runId}`), 'falha.txt', 'text/plain');
      assert.ok(failed.status >= 500, JSON.stringify(failed));
      assert.ok(!JSON.stringify(failed.data).includes(uploadRoot));
    } finally {
      await unlink(objects).catch(error => { if (error.code !== 'ENOENT') throw error; });
      await rename(saved, objects);
    }
    assert.deepEqual(await snapshot(), before);
    assert.equal(Number((await db('attachments').where({ticket_id: ticket.id, status: 'pending'}).count('* as n').first()).n), 0);
  });

  await t.test('reinício preserva bytes prontos e recupera publicação interrompida sem apagar evidências', async () => {
    const ready = await db('attachments').where({id: publicFile.id}).first();
    const pendingId = randomUUID(), pendingKey = randomUUID(), orphanKey = randomUUID();
    const old = past();
    await db('attachments').insert({...ready, id: pendingId, request_key: randomUUID(), storage_key: pendingKey, original_name: 'interrompido.txt', mime_type: 'text/plain', size_bytes: textBytes.length, sha256: digest(textBytes), status: 'pending', created_at: old, ready_at: null, failed_at: null});
    const pendingPath = join(uploadRoot, 'pending', `${pendingKey}.tmp`), orphanPath = join(uploadRoot, 'pending', `${orphanKey}.tmp`);
    await mkdir(join(uploadRoot, 'pending'), {recursive: true});
    await writeFile(pendingPath, textBytes); await writeFile(orphanPath, textBytes);
    await utimes(pendingPath, old, old); await utimes(orphanPath, old, old);
    const readyPath = join(uploadRoot, 'objects', `${ready.storage_key}.bin`);
    await utimes(readyPath, old, old);
    await stopApi(); await startApi();
    const response = await download(mentee, publicFile.id);
    assert.equal(response.status, 200); assert.equal(digest(response.bytes), digest(pdfBytes));
    assert.equal((await db('attachments').where({id: publicFile.id}).first()).status, 'ready');
    const interrupted = await db('attachments').where({id: pendingId}).first();
    assert.equal(interrupted.status, 'failed'); assert.ok(interrupted.failed_at);
    await assert.rejects(() => stat(pendingPath), error => error.code === 'ENOENT');
    assert.equal(digest(await readFile(orphanPath)), digest(textBytes), 'Arquivo desconhecido é preservado para recuperação manual, sem exposição pública.');
    assert.equal((await download(mentee, pendingId)).status, 404);
  });
});

after(async () => { await stopApi(); if (db) await db.destroy(); });
