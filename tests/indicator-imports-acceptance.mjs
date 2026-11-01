import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {createHash, createHmac, randomUUID} from 'node:crypto';
import {integrationEnvironment} from './helpers/integration-environment.mjs';

const app = integrationEnvironment({database: 'elo_importscheck', port: 3341, redisDb: 8});
const {ok, request} = app;
let admin, mentor, mentor2, mentee, mentee2, own, other, accessibleOther, external, foreign, plan;
let existingDraft, existingPublished, existingArchived, mixedText, mixedPreview, mixedBody, mixedBatch;
const parts = new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit'}).formatToParts(new Date());
const year = Number(parts.find(value => value.type === 'year').value), month = Number(parts.find(value => value.type === 'month').value) - 1;
const period = offset => new Date(Date.UTC(year, month + offset, 1)).toISOString().slice(0, 7);
const header = ['periodo', 'situacao', 'origem', 'observacoes', 'base_confirmada', 'faturamento', 'pedidos', 'visitas'];
const csvCell = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
const csv = rows => '\uFEFF' + header.join(';') + '\r\n' + rows.map(row => row.map(csvCell).join(';')).join('\r\n') + '\r\n';
const row = (offset, overrides = {}) => [overrides.period ?? period(offset), 'fechado', overrides.source ?? 'Consolidação mensal CSV',
  overrides.notes ?? 'Dados conferidos do arquivo.', 'sim', overrides.revenue ?? '1000,00', overrides.orders ?? '10', overrides.visits ?? '100'];
const preview = (actor, client, csvText) => ok(actor, '/indicators/csv-preview', {enrollmentId: client.enrollmentId, csvText});
const confirmBody = (client, csvText, result, extra = {}) => ({enrollmentId: client.enrollmentId, csvText,
  previewToken: result.previewToken, requestKey: randomUUID(), confirmed: true, duplicatePolicy: 'skip_existing', fileName: 'indicadores.csv', ...extra});
async function importRows(actor, client, rows, extra = {}) {
  const text = csv(rows), result = await preview(actor, client, text), input = confirmBody(client, text, result, extra);
  return {batch: await ok(actor, '/indicators/csv-import', input), input};
}
const detail = (actor, item) => ok(actor, `/indicators/${item.id}`);
const batchDetail = (actor, item) => ok(actor, `/indicators/imports/${item.id}`);
async function publish(actor, item) { return ok(actor, `/indicators/${item.id}/publish`, {expectedVersion: (await detail(actor, item)).draftVersion}); }
async function manual(offset) {
  return ok(mentor, '/indicators', {enrollmentId: own.enrollmentId, period: period(offset), periodStatus: 'closed', sourceLabel: 'Apuração manual preservada',
    notes: `Original ${offset}`, basisConfirmed: true, adsAttributionConfirmed: false, costsComplete: false, values: {revenue: '500.00', orders: 5}});
}
async function snapshot() {
  const rows = await Promise.all(['indicators', 'indicator_revisions', 'indicator_goals', 'indicator_imports', 'audit_events']
    .map(table => app.db(table).where({organization_id: admin.user.organizationId}).orderBy('id')));
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}
async function download(actor, batch) {
  const response = await fetch(app.origin + `/api/indicators/imports/${batch.id}/report.csv`, {headers: {Cookie: actor.cookie}});
  return {status: response.status, headers: response.headers, text: await response.text()};
}
function csvRecords(input) {
  const records = []; let fields = [], value = '', quoted = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === '"') { if (quoted && input[i + 1] === '"') {value += '"'; i++;} else quoted = !quoted; }
    else if (!quoted && c === ';') {fields.push(value); value = '';}
    else if (!quoted && (c === '\n' || c === '\r')) {
      if (c === '\r' && input[i + 1] === '\n') i++;
      fields.push(value); if (fields.some(field => field.length)) records.push(fields); fields = []; value = '';
    } else value += c;
  }
  if (value || fields.length) {fields.push(value); records.push(fields);}
  return records;
}
function shortToken(original, issuedAt, expiresAt) {
  const claims = JSON.parse(Buffer.from(original.split('.')[0], 'base64url').toString('utf8'));
  const encoded = Buffer.from(JSON.stringify({...claims, issuedAt, expiresAt})).toString('base64url');
  const signature = createHmac('sha256', process.env.SESSION_SECRET).update('elo:indicator-csv-preview:v1\0').update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

before(async () => {
  await app.start();
  ({admin, mentor, mentor2, mentee, mentee2} = await app.accounts());
  const program = (await ok(admin, '/programs'))[0];
  own = await app.client(admin, program.id, mentor.user.id, mentee.user.id, 'Importação própria');
  other = await app.client(admin, program.id, mentor2.user.id, mentee2.user.id, 'Importação outra carteira');
  accessibleOther = await app.client(admin, program.id, mentor.user.id, mentee.user.id, 'Outra empresa autorizada');
  external = await app.externalOrganization();
  foreign = await app.client(external.admin, external.programId, external.mentorId, null, 'Importação outra organização');
  plan = await ok(mentor, '/plans', {enrollmentId: own.enrollmentId, title: 'Melhoria acompanhada', objective: 'Melhorar os resultados confirmados.'});
  existingDraft = await manual(-1); existingPublished = await manual(-2); existingArchived = await manual(-3);
  await publish(mentor, existingPublished); await publish(mentor, existingArchived);
  await ok(mentor, `/indicators/${existingArchived.id}/status`, {expectedVersion: (await detail(mentor, existingArchived)).draftVersion,
    status: 'archived', reason: 'Preservar histórico sem sobrescrever pela importação.'});
  mixedText = csv([
    row(-4, {revenue: '1234,56', orders: '4', notes: 'Conferência de preço\nSegunda linha com "aspas"; texto.'}),
    row(-5, {revenue: '0.00', orders: '0', visits: ''}),
    row(-6, {revenue: '-1'}), row(-7), row(-7, {revenue: '2000,00'}),
    row(-1), row(-2), row(-3), row(-8, {period: '=1+1'}),
  ]);
});

test('Importação CSV em lote: confirmação, atomicidade, repetição e privacidade', async t => {
  await t.test('prévia classifica todos os duplicados, preserva campos e não grava registros nem auditoria', async () => {
    const before = await snapshot();
    mixedPreview = await preview(mentor, own, mixedText);
    assert.deepEqual(mixedPreview.counts, {create: 2, conflict: 3, invalid: 4});
    assert.equal(mixedPreview.rows[3].classification, 'invalid'); assert.equal(mixedPreview.rows[4].classification, 'invalid');
    assert.equal(mixedPreview.rows[0].data.values.revenue, '1234.56');
    assert.equal(mixedPreview.rows[1].data.values.revenue, '0.00'); assert.equal(mixedPreview.rows[1].data.values.orders, 0);
    assert.equal(mixedPreview.rows[1].data.values.visits, null);
    assert.ok(mixedPreview.previewToken); assert.ok(Date.parse(mixedPreview.expiresAt) > Date.now());
    assert.ok(Date.parse(mixedPreview.expiresAt) <= Date.now() + 1801e3);
    const malformedDuplicate = await preview(mentor, own, csv([row(-21), [...row(-21), 'coluna excedente'], row(-22)]));
    assert.deepEqual(malformedDuplicate.counts, {create: 1, conflict: 0, invalid: 2});
    assert.equal(malformedDuplicate.rows[0].classification, 'invalid');
    assert.equal(malformedDuplicate.rows[1].classification, 'invalid');
    assert.equal(malformedDuplicate.rows[2].classification, 'create');
    assert.equal(await snapshot(), before);
    mixedBody = confirmBody(own, mixedText, mixedPreview, {fileName: '=SUM(1;1).csv'});
  });

  await t.test('confirmação exige prévia autêntica, o mesmo arquivo, autor, contratação e consentimento explícito', async () => {
    const before = await snapshot();
    for (const patch of [{previewToken: ''}, {confirmed: false}, {duplicatePolicy: 'overwrite'},
      {requestKey: 'inválido'}, {fileName: 'x'.repeat(151)}, {sourceType: 'manual'}]) {
      const result = await request(mentor, '/indicators/csv-import', {...mixedBody, ...patch});
      assert.equal(result.status, 400, JSON.stringify(result));
    }
    assert.equal((await request(mentor, '/indicators/csv-import', {...mixedBody, previewToken: 'forjado'})).status, 403);
    const [encoded, signature] = mixedBody.previewToken.split('.');
    const claims = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    const tampered = Buffer.from(JSON.stringify({...claims, expiresAt: claims.expiresAt - 1000})).toString('base64url') + '.' + signature;
    assert.equal((await request(mentor, '/indicators/csv-import', {...mixedBody, previewToken: tampered})).status, 403);
    const absent = {...mixedBody}; delete absent.previewToken;
    assert.equal((await request(mentor, '/indicators/csv-import', absent)).status, 400);
    for (const [actor, patch] of [[mentor, {csvText: mixedText.replace('1234,56', '9999,99')}],
      [admin, {}], [mentor, {enrollmentId: other.enrollmentId}], [mentor, {enrollmentId: accessibleOther.enrollmentId}]]) {
      const result = await request(actor, '/indicators/csv-import', {...mixedBody, ...patch});
      assert.ok([400, 403, 404, 409].includes(result.status), JSON.stringify(result));
    }
    assert.equal((await request({...mentor, csrfToken: 'inválido'}, '/indicators/csv-import', mixedBody)).status, 403);
    assert.equal((await request(mentee, '/indicators/csv-import', mixedBody)).status, 403);
    assert.equal((await request(null, '/indicators/csv-import', mixedBody)).status, 401);
    assert.equal(await snapshot(), before);
  });

  await t.test('lote misto cria somente minutas CSV e mantém existentes, revisões, metas e progresso intactos', async () => {
    const originals = await Promise.all([existingDraft, existingPublished, existingArchived].map(item => detail(mentor, item)));
    const contact = (await app.db('enrollments').where({id: own.enrollmentId}).first()).last_contact_at;
    const progress = (await ok(mentor, `/plans/${plan.id}`)).lastProgressAt;
    const revisions = await app.db('indicator_revisions').where({enrollment_id: own.enrollmentId}).count('* as count').first();
    const goals = await app.db('indicator_goals').where({enrollment_id: own.enrollmentId}).count('* as count').first();
    mixedBatch = await ok(mentor, '/indicators/csv-import', mixedBody);
    assert.deepEqual(mixedBatch.counts, {total: 9, imported: 2, skipped: 3, invalid: 4});
    assert.equal(mixedBatch.duplicatePolicy, 'skip_existing'); assert.equal(mixedBatch.rows.length, 9);
    assert.deepEqual(mixedBatch.rows.map(value => value.status), ['imported', 'imported', 'invalid', 'invalid', 'invalid', 'skipped', 'skipped', 'skipped', 'invalid']);
    for (const imported of mixedBatch.rows.filter(value => value.status === 'imported')) {
      const created = await detail(mentor, {id: imported.indicatorId});
      assert.equal(created.status, 'draft'); assert.equal(created.sourceType, 'csv'); assert.equal(created.published, null);
      assert.equal((await request(mentee, `/indicators/${created.id}`)).status, 404);
    }
    assert.deepEqual(await Promise.all([existingDraft, existingPublished, existingArchived].map(item => detail(mentor, item))), originals);
    assert.deepEqual(await app.db('indicator_revisions').where({enrollment_id: own.enrollmentId}).count('* as count').first(), revisions);
    assert.deepEqual(await app.db('indicator_goals').where({enrollment_id: own.enrollmentId}).count('* as count').first(), goals);
    assert.equal((await app.db('enrollments').where({id: own.enrollmentId}).first()).last_contact_at, contact);
    assert.equal((await ok(mentor, `/plans/${plan.id}`)).lastProgressAt, progress);
  });

  await t.test('repetição exata devolve o mesmo lote e chave reutilizada com conteúdo ou autor diferente é recusada', async () => {
    const before = await snapshot();
    assert.deepEqual(await ok(mentor, '/indicators/csv-import', mixedBody), mixedBatch);
    for (const [actor, patch] of [[mentor, {fileName: 'outro.csv'}], [mentor, {csvText: mixedText + '\n'}], [admin, {}]]) {
      assert.equal((await request(actor, '/indicators/csv-import', {...mixedBody, ...patch})).status, 409);
    }
    assert.equal(await snapshot(), before);
  });

  await t.test('histórico e relatório são exclusivos da equipe; CSV neutraliza fórmulas e a publicação posterior mantém origem', async () => {
    assert.deepEqual(await batchDetail(mentor, mixedBatch), mixedBatch);
    assert.ok((await ok(admin, `/indicators/imports?enrollmentId=${own.enrollmentId}`)).some(value => value.id === mixedBatch.id));
    for (const path of [`/indicators/imports?enrollmentId=${own.enrollmentId}`, `/indicators/imports/${mixedBatch.id}`]) {
      assert.equal((await request(mentee, path)).status, 403);
      assert.equal((await request(mentor2, path)).status, 404);
      assert.equal((await request(external.admin, path)).status, 404);
    }
    assert.equal((await download(mentee, mixedBatch)).status, 403);
    assert.equal((await download(mentor2, mixedBatch)).status, 404);
    assert.equal((await download(external.admin, mixedBatch)).status, 404);
    const report = await download(mentor, mixedBatch);
    assert.equal(report.status, 200); assert.match(report.headers.get('content-type'), /text\/csv/);
    assert.match(report.headers.get('content-disposition'), /attachment/); assert.match(report.headers.get('cache-control'), /no-store/);
    assert.equal(report.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(!report.headers.get('content-disposition').includes(mixedBody.fileName));
    const records = csvRecords(report.text.replace(/^\uFEFF/, ''));
    assert.ok(records.length >= mixedBatch.rows.length + 1);
    for (const cell of records.flat()) assert.ok(!/^[\s\uFEFF]*[=+@-]/.test(cell), `Célula pode virar fórmula: ${cell}`);
    assert.ok(report.text.includes("'=1+1"));
    const item = {id: mixedBatch.rows[0].indicatorId}; await publish(mentor, item);
    const published = await detail(mentee, item);
    assert.equal(published.sourceType, 'csv'); assert.equal(published.published.values.revenue, '1234.56');
    assert.ok(!('history' in published)); assert.ok(!('draft' in published));
    assert.equal((await request(mentee, `/indicators/imports/${mixedBatch.id}`)).status, 403);
  });

  await t.test('arquivo inválido ou sem novos meses não oferece confirmação e não cria lote', async () => {
    const before = await snapshot();
    for (const text of [csv([row(-1)]), csv([row(-20, {revenue: '-1'})]), csv([row(-20), row(-20)]), header.join(';')]) {
      const result = await preview(mentor, own, text);
      assert.equal(result.previewToken, null); assert.equal(result.expiresAt, null);
      const attempt = await request(mentor, '/indicators/csv-import', confirmBody(own, text, result));
      assert.ok([400, 409].includes(attempt.status));
    }
    assert.equal(await snapshot(), before);
  });

  await t.test('CSV válido de 54 KiB com muitas barras conserva conteúdo mesmo quando o envelope JSON ultrapassa 100 KiB', async () => {
    const notes = '\\'.repeat(9000), text = csv([-30, -31, -32, -33, -34, -35].map(offset => row(offset, {notes})));
    assert.ok(Buffer.byteLength(text, 'utf8') >= 54000);
    assert.ok(Buffer.byteLength(text, 'utf8') < 65536);
    assert.ok(Buffer.byteLength(JSON.stringify({enrollmentId: own.enrollmentId, csvText: text}), 'utf8') > 100 * 1024);
    const prepared = await preview(mentor, own, text);
    assert.deepEqual(prepared.counts, {create: 6, conflict: 0, invalid: 0});
    const imported = await ok(mentor, '/indicators/csv-import', confirmBody(own, text, prepared));
    assert.deepEqual(imported.counts, {total: 6, imported: 6, skipped: 0, invalid: 0});
    for (const item of imported.rows) assert.equal((await detail(mentor, {id: item.indicatorId})).draft.notes, notes);
    const before = await snapshot();
    assert.equal((await request(mentor, '/indicators/csv-preview', {enrollmentId: own.enrollmentId, csvText: 'x'.repeat(65537)})).status, 400);
    assert.equal(await snapshot(), before);
  });

  await t.test('mudança após a prévia exige revisão antes da confirmação e não cria lote parcial', async () => {
    const text = csv([row(-9), row(-10)]), prepared = await preview(mentor, own, text);
    const inserted = await manual(-9), before = await snapshot();
    assert.equal((await request(mentor, '/indicators/csv-import', confirmBody(own, text, prepared))).status, 409);
    assert.equal(await snapshot(), before);
    assert.equal(await app.db('indicators').where({enrollment_id: own.enrollmentId, period: period(-10)}).first(), undefined);
    assert.equal((await detail(mentor, inserted)).sourceType, 'manual');
  });

  await t.test('confirmações concorrentes da mesma chave produzem um lote e um conjunto de registros e auditoria', async () => {
    const text = csv([row(-11), row(-12)]), prepared = await preview(mentor, own, text), input = confirmBody(own, text, prepared);
    const results = await Promise.all([ok(mentor, '/indicators/csv-import', input), ok(mentor, '/indicators/csv-import', input)]);
    assert.deepEqual(results[0], results[1]); assert.equal(results[0].counts.imported, 2);
    assert.equal(Number((await app.db('indicator_imports').where({id: results[0].id}).count('* as count').first()).count), 1);
    assert.equal(Number((await app.db('indicators').where({enrollment_id: own.enrollmentId}).whereIn('period', [period(-11), period(-12)]).count('* as count').first()).count), 2);
    assert.equal(Number((await app.db('audit_events').where({entity_type: 'indicator_import', entity_id: results[0].id}).count('* as count').first()).count), 1);
    assert.equal(Number((await app.db('audit_events').where({entity_type: 'indicator'}).whereIn('entity_id', results[0].rows.map(value => value.indicatorId)).count('* as count').first()).count), 2);
    const before = await snapshot(); await ok(mentor, '/indicators/csv-import', input); assert.equal(await snapshot(), before);
  });

  await t.test('duas chaves concorrentes não importam o mesmo mês a partir de uma prévia antiga', async () => {
    const text = csv([row(-15)]), prepared = await preview(mentor, own, text);
    const results = await Promise.all([
      request(mentor, '/indicators/csv-import', confirmBody(own, text, prepared)),
      request(mentor, '/indicators/csv-import', confirmBody(own, text, prepared)),
    ]);
    assert.equal(results.filter(value => value.status >= 200 && value.status < 300).length, 1, JSON.stringify(results));
    assert.equal(results.filter(value => value.status === 409).length, 1);
    assert.equal(Number((await app.db('indicators').where({enrollment_id: own.enrollmentId, period: period(-15)}).count('* as count').first()).count), 1);
  });

  await t.test('token expirado recusa nova importação, mas repetição de lote confirmado continua idempotente', async () => {
    const text = csv([row(-16)]), prepared = await preview(mentor, own, text), now = Date.now();
    const expired = confirmBody(own, text, {...prepared, previewToken: shortToken(prepared.previewToken, now - 3000, now - 1000)});
    const before = await snapshot(), failure = await request(mentor, '/indicators/csv-import', expired);
    assert.equal(failure.status, 409); assert.equal(failure.data.code, 'CSV_PREVIEW_EXPIRED');
    assert.equal(await snapshot(), before);
    const expiresAt = Date.now() + 3000;
    const input = confirmBody(own, text, {...prepared, previewToken: shortToken(prepared.previewToken, Date.now(), expiresAt)});
    const imported = await ok(mentor, '/indicators/csv-import', input), stable = await snapshot();
    await new Promise(resolve => setTimeout(resolve, Math.max(0, expiresAt - Date.now() + 100)));
    assert.deepEqual(await ok(mentor, '/indicators/csv-import', input), imported);
    assert.equal(await snapshot(), stable);
  });

  await t.test('falha real no registro da auditoria desfaz lote, indicadores e eventos, permitindo tentar novamente', async () => {
    const text = csv([row(-13), row(-14)]), prepared = await preview(mentor, own, text), input = confirmBody(own, text, prepared);
    const name = `imports_rollback_${app.runId.replaceAll('-', '')}`;
    const before = await snapshot();
    await app.db.raw(`CREATE FUNCTION ??() RETURNS trigger LANGUAGE plpgsql AS $body$ BEGIN
      IF NEW.entity_type = 'indicator_import' AND NEW.actor_id = '${mentor.user.id}'::uuid THEN
        RAISE EXCEPTION 'falha induzida no ensaio isolado';
      END IF; RETURN NEW; END; $body$`, [name]);
    try {
      await app.db.raw('CREATE TRIGGER ?? BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION ??()', [name, name]);
      const result = await request(mentor, '/indicators/csv-import', input);
      assert.equal(result.status, 500);
      assert.equal(await snapshot(), before);
    } finally {
      await app.db.raw('DROP TRIGGER IF EXISTS ?? ON audit_events', [name]);
      await app.db.raw('DROP FUNCTION IF EXISTS ??()', [name]);
    }
    const retried = await ok(mentor, '/indicators/csv-import', input);
    assert.equal(retried.counts.imported, 2);
  });

  await t.test('escopo, pausa e cobertura são revalidados até em repetição de lote já confirmado', async () => {
    const foreignBatch = (await importRows(external.admin, foreign, [row(-1)])).batch;
    for (const actor of [admin, mentor, mentee]) {
      const status = actor.user.role === 'mentee' ? 403 : 404;
      assert.equal((await request(actor, `/indicators/imports/${foreignBatch.id}`)).status, status);
      assert.equal((await download(actor, foreignBatch)).status, status);
    }
    await ok(admin, `/enrollments/${own.enrollmentId}`, {expectedVersion: (await ok(admin, `/journey/enrollments/${own.enrollmentId}`)).journeyVersion, status: 'paused', reason: 'Pausa temporária para conferência.'}, 'PATCH');
    try {
      assert.equal((await request(mentor, '/indicators/csv-import', mixedBody)).status, 400);
      assert.equal((await request(mentor, '/indicators/csv-preview', {enrollmentId: own.enrollmentId, csvText: mixedText})).status, 400);
      assert.equal((await request(mentor, `/indicators/imports/${mixedBatch.id}`)).status, 200);
    } finally { await ok(admin, `/enrollments/${own.enrollmentId}`, {expectedVersion: (await ok(admin, `/journey/enrollments/${own.enrollmentId}`)).journeyVersion, status: 'active', reason: 'Conferência concluída.'}, 'PATCH'); }
    await ok(admin, `/enrollments/${own.enrollmentId}/assignments`, {mentorId: mentor2.user.id, kind: 'primary'});
    assert.equal((await request(mentor, '/indicators/csv-import', mixedBody)).status, 404);
    assert.equal((await request(mentor, `/indicators/imports/${mixedBatch.id}`)).status, 404);
    assert.equal((await download(mentor, mixedBatch)).status, 404);
    assert.equal((await request(mentor2, `/indicators/imports/${mixedBatch.id}`)).status, 200);
    await ok(admin, `/enrollments/${own.enrollmentId}/assignments`, {mentorId: mentor.user.id, kind: 'coverage', endsAt: new Date(Date.now() + 3600e3).toISOString()});
    assert.equal((await request(mentor, `/indicators/imports/${mixedBatch.id}`)).status, 200);
    await app.db('assignments').where({enrollment_id: own.enrollmentId, mentor_id: mentor.user.id, kind: 'coverage'}).update({starts_at: new Date(Date.now() - 3600e3), ends_at: new Date(Date.now() - 1000)});
    assert.equal((await request(mentor, '/indicators/csv-import', mixedBody)).status, 404);
    assert.equal((await request(mentor, `/indicators/imports/${mixedBatch.id}`)).status, 404);
    await ok(admin, `/enrollments/${own.enrollmentId}/assignments`, {mentorId: mentor.user.id, kind: 'primary'});
    assert.deepEqual(await ok(mentor, '/indicators/csv-import', mixedBody), mixedBatch);
  });

  await t.test('relatório preserva nomes históricos e banco impede vínculo entre organizações ou alteração pelo papel da aplicação', async () => {
    const originalUser = await app.db('users').where({id: mentor.user.id}).first();
    const originalClient = await app.db('clients').where({id: own.id}).first();
    await app.db('users').where({id: mentor.user.id}).update({name: 'Nome alterado após importação'});
    await app.db('clients').where({id: own.id}).update({name: 'Empresa alterada após importação'});
    try { assert.deepEqual(await batchDetail(mentor, mixedBatch), mixedBatch); }
    finally {
      await app.db('users').where({id: mentor.user.id}).update({name: originalUser.name});
      await app.db('clients').where({id: own.id}).update({name: originalClient.name});
    }
    const stored = await app.db('indicator_imports').where({id: mixedBatch.id}).first();
    await assert.rejects(() => app.db('indicator_imports').insert({...stored, id: randomUUID(), request_key: randomUUID(), enrollment_id: foreign.enrollmentId}), error => error.code === '23503');
    for (const operation of ['UPDATE', 'DELETE']) {
      const access = await app.db.raw('SELECT has_table_privilege(?, ?, ?) AS allowed', ['elo_app', 'indicator_imports', operation]);
      assert.equal(access.rows[0].allowed, false);
    }
  });
});

after(() => app.stop());
