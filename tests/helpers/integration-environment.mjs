import assert from 'node:assert/strict';
import {config} from 'dotenv';
import knex from 'knex';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {resolve} from 'node:path';

// New suites opt into a dedicated database, API port, Redis database and private
// upload directory. No production records, databases or volumes are removed.
export function integrationEnvironment({database, port, redisDb}) {
  assert.match(database, /^elo_[a-z]+check$/);
  assert.ok(port >= 3334 && port <= 3399);
  assert.ok(redisDb >= 1 && redisDb <= 15);
  config({quiet: true});
  const origin = `http://localhost:${port}`, runId = randomUUID();
  const ownerBase = `postgresql://elo_owner:${process.env.DB_OWNER_PASSWORD}@127.0.0.1:55432/`;
  const env = {...process.env, NODE_ENV: 'development', PORT: String(port), APP_ORIGIN: origin,
    DATABASE_URL: `postgresql://elo_app:${process.env.DB_APP_PASSWORD}@127.0.0.1:55432/${database}`,
    MIGRATION_DATABASE_URL: ownerBase + database,
    REDIS_URL: `redis://:${process.env.REDIS_PASSWORD}@127.0.0.1:56379/${redisDb}`,
    UPLOAD_DIR: resolve(`.local/test-uploads/${database}`)};
  let db, server;
  function cli(command) {
    return new Promise((resolvePromise, reject) => {
      const child = spawn(process.execPath, ['apps/api/dist/cli.js', command], {env, stdio: ['ignore', 'ignore', 'pipe']});
      let failure = '';
      child.stderr.on('data', chunk => {failure = (failure + chunk).slice(-8000);});
      child.once('error', reject); child.once('exit', code => {
        for (const key of ['DB_OWNER_PASSWORD', 'DB_APP_PASSWORD', 'REDIS_PASSWORD', 'SESSION_SECRET', 'DEMO_PASSWORD'])
          if (env[key]) failure = failure.replaceAll(env[key], '[segredo omitido]');
        return code === 0 ? resolvePromise() : reject(new Error(`CLI ${command} falhou (${code}): ${failure.trim()}`));
      });
    });
  }
  async function request(session, path, body, method = body === undefined ? 'GET' : 'POST') {
    const response = await fetch(origin + '/api' + path, {method, headers: {'Content-Type': 'application/json', Origin: origin,
      ...(session ? {Cookie: session.cookie, 'X-CSRF-Token': session.csrfToken} : {})}, ...(body === undefined ? {} : {body: JSON.stringify(body)})});
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
  async function start() {
    assert.ok(process.env.DEMO_PASSWORD?.length >= 12);
    await new Promise((resolvePromise, reject) => {
      const probe = createServer(); probe.once('error', () => reject(new Error(`Porta ${port} ocupada; não reutilizar API existente.`)));
      probe.listen(port, '127.0.0.1', () => probe.close(resolvePromise));
    });
    const connection = knex({client: 'pg', connection: ownerBase + 'postgres'});
    try { if (!(await connection('pg_database').where({datname: database}).first())) await connection.raw('CREATE DATABASE ?? OWNER elo_owner', [database]); }
    finally { await connection.destroy(); }
    db = knex({client: 'pg', connection: ownerBase + database});
    await cli('migrate'); await cli('seed');
    server = spawn(process.execPath, ['apps/api/dist/main.js'], {env, stdio: ['ignore', 'ignore', 'ignore']});
    for (let attempt = 0; attempt < 80; attempt++) {
      if (server.exitCode !== null) throw new Error('API isolada encerrou antes da prontidão.');
      try { if ((await fetch(origin + '/api/health/live')).ok) return; } catch {}
      await new Promise(resolvePromise => setTimeout(resolvePromise, 150));
    }
    throw new Error('API isolada não iniciou.');
  }
  async function stop() {
    if (server && server.exitCode === null) {
      server.kill();
      await new Promise(resolvePromise => { server.once('exit', resolvePromise); const timer = setTimeout(resolvePromise, 3000); timer.unref(); });
    }
    if (db) await db.destroy();
  }
  async function accounts() {
    const seedAdmin = await db('users').where({email: 'admin@demo.local'}).first();
    const rows = ['admin', 'mentor', 'mentor2', 'mentee', 'mentee2'].map(label => ({id: randomUUID(), organization_id: seedAdmin.organization_id,
      name: `Ensaio ${label}`, email: `${label}-${runId}@${database.replaceAll('_', '-')}.test`, role: label.replace('2', ''), password_hash: seedAdmin.password_hash}));
    await db('users').insert(rows);
    const [admin, mentor, mentor2, mentee, mentee2] = await Promise.all(rows.map(row => signin(row.email)));
    return {admin, mentor, mentor2, mentee, mentee2};
  }
  async function client(actor, programId, mentorId, memberId, name) {
    const value = await ok(actor, '/clients', {name: `${name} ${runId}`, contactName: 'Pessoa de teste', email: `${randomUUID()}@test.local`, programId, mentorId});
    if (memberId) await db('client_members').insert({organization_id: actor.user.organizationId, client_id: value.id, user_id: memberId});
    return value;
  }
  async function externalOrganization() {
    const organizationId = randomUUID(), id = randomUUID(), mentorId = randomUUID(), programId = randomUUID(), email = `${runId}@external-${database.replaceAll('_', '-')}.test`;
    const seed = await db('users').where({email: 'admin@demo.local'}).first();
    await db.transaction(async trx => {
      await trx('organizations').insert({id: organizationId, name: 'Outra organização de teste'});
      await trx('users').insert([{id, organization_id: organizationId, name: 'Admin externo', email, role: 'admin', password_hash: seed.password_hash},
        {id: mentorId, organization_id: organizationId, name: 'Mentor externo', email: `${randomUUID()}@external.test`, role: 'mentor', password_hash: seed.password_hash}]);
      await trx('programs').insert({id: programId, organization_id: organizationId, name: 'Programa externo', calendar: JSON.stringify({timezone: 'America/Sao_Paulo', days: [1, 2, 3, 4, 5], startHour: 9, endHour: 18, holidays: []})});
    });
    return {admin: await signin(email), organizationId, mentorId, programId};
  }
  return {get db() {return db;}, runId, origin, start, stop, request, ok, signin, accounts, client, externalOrganization, cli};
}
