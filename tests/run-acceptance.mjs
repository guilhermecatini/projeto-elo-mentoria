import {config} from 'dotenv';
import knex from 'knex';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {resolve} from 'node:path';

config({quiet: true});
const database = 'elo_acceptance';
const origin = 'http://localhost:3334';
const ownerBase = `postgresql://elo_owner:${process.env.DB_OWNER_PASSWORD}@127.0.0.1:55432/`;
const env = {
  ...process.env, NODE_ENV: 'development', PORT: '3334', APP_ORIGIN: origin,
  DATABASE_URL: `postgresql://elo_app:${process.env.DB_APP_PASSWORD}@127.0.0.1:55432/${database}`,
  MIGRATION_DATABASE_URL: ownerBase + database,
  REDIS_URL: `redis://:${process.env.REDIS_PASSWORD}@127.0.0.1:56379/1`,
  TEST_DATABASE_NAME: database, TEST_API_URL: origin + '/api',
  UPLOAD_DIR: resolve('.local/test-uploads/elo_acceptance'),
};
let api;
function run(args, visible = false) {
  return new Promise((resolve, reject) => {
    const processHandle = spawn(process.execPath, args, {env, stdio: visible ? 'inherit' : ['ignore', 'ignore', 'ignore']});
    processHandle.once('error', reject);
    processHandle.once('exit', code => code === 0 ? resolve() : reject(new Error(`Verificação falhou (${code}): ${args.join(' ')}`)));
  });
}
try {
  if (!process.env.DEMO_PASSWORD || process.env.DEMO_PASSWORD.length < 12) throw new Error('Defina DEMO_PASSWORD para os dados isolados de desenvolvimento.');
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', () => reject(new Error('Porta 3334 ocupada. O teste não reutiliza servidores existentes.')));
    probe.listen(3334, '127.0.0.1', () => probe.close(resolve));
  });
  const connection = knex({client: 'pg', connection: ownerBase + 'postgres'});
  try {
    if (!(await connection('pg_database').where({datname: database}).first())) await connection.raw('CREATE DATABASE elo_acceptance OWNER elo_owner');
  } finally { await connection.destroy(); }
  await run(['apps/api/dist/cli.js', 'migrate']);
  await run(['apps/api/dist/cli.js', 'seed']);
  api = spawn(process.execPath, ['apps/api/dist/main.js'], {env, stdio: ['ignore', 'ignore', 'ignore']});
  for (let attempt = 0; attempt < 80; attempt++) {
    if (api.exitCode !== null) throw new Error('API isolada encerrou antes da prontidão.');
    try { if ((await fetch(origin + '/api/health/live')).ok) break; } catch {}
    if (attempt === 79) throw new Error('API isolada não iniciou.');
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  await run(['--test', 'tests/acceptance.mjs'], true);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (api && api.exitCode === null) {
    api.kill();
    await new Promise(resolve => { api.once('exit', resolve); const timer = setTimeout(resolve, 3000); timer.unref(); });
  }
}
