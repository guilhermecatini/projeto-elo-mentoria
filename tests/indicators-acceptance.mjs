import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {integrationEnvironment} from './helpers/integration-environment.mjs';

const app = integrationEnvironment({database: 'elo_indicatorscheck', port: 3340, redisDb: 7});
const {ok, request} = app;
let admin, mentor, mentor2, mentee, mentee2, own, other, external, foreign, evolutionClient;
let plan, otherPlan, foreignPlan, secondCyclePlan, report, otherReport, foreignReport, partialReport, goal;
const values = (changes = {}) => ({revenue: '1000.00', orders: 10, visits: 100, adSpend: '100.00', attributedRevenue: '400.00', totalCosts: '800.00',
  claims: 0, cancellations: 1, lateShipments: 2, skuCount: 10, outOfStockSkus: 2, activeListings: 10, completeListings: 8, ...changes});
const data = (changes = {}) => ({periodStatus: 'closed', sourceLabel: 'Relatório consolidado da loja', notes: 'Informação manual conferida.',
  basisConfirmed: true, adsAttributionConfirmed: true, costsComplete: true, values: values(), ...changes});

// Periods follow the same São Paulo calendar as the monthly reporting rules.
const monthParts = new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit'})
  .formatToParts(new Date());
const year = Number(monthParts.find(value => value.type === 'year').value);
const monthIndex = Number(monthParts.find(value => value.type === 'month').value) - 1;
const period = offset => {
  const date = new Date(Date.UTC(year, monthIndex + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
};
const createPlan = (actor, client, title) => ok(actor, '/plans', {enrollmentId: client.enrollmentId, title, objective: 'Acompanhar uma melhoria mensurável do negócio.'});
const create = (actor, client, offset, changes = {}) => ok(actor, '/indicators', {enrollmentId: client.enrollmentId, period: period(offset), ...data(changes)});
const evolution = (actor, client, from = -6, to = 0) => ok(actor, `/indicators/evolution?enrollmentId=${client.enrollmentId}&from=${period(from)}&to=${period(to)}`);
const exportUrl = (client, from = -5, to = 0) => `${app.origin}/api/indicators/evolution/export.csv?${new URLSearchParams({enrollmentId: client.enrollmentId, from: period(from), to: period(to)})}`;
const exportCsv = (actor, client, from, to) => fetch(exportUrl(client, from, to), {headers: {Cookie: actor.cookie}});
const goalDetail = (actor, item) => ok(actor, `/indicator-goals/${item.id}`);
const preview = (actor, csvText, client = own) => ok(actor, '/indicators/csv-preview', {enrollmentId: client.enrollmentId, csvText});
const csvCell = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
const csv = (header, rows) => '\uFEFF' + header.join(';') + '\r\n' + rows.map(row => row.map(csvCell).join(';')).join('\r\n') + '\r\n';
async function persistedSnapshot() {
  const records = await Promise.all(['indicators', 'indicator_revisions', 'indicator_goals', 'audit_events']
    .map(table => app.db(table).where({organization_id: admin.user.organizationId}).orderBy('id')));
  return createHash('sha256').update(JSON.stringify(records)).digest('hex');
}
const current = (actor, item, version) => ok(actor, `/indicators/${item.id}${version ? `?version=${version}` : ''}`);
const body = (detail, changes = {}) => ({expectedVersion: detail.draftVersion,
  ...Object.fromEntries(['periodStatus', 'sourceLabel', 'notes', 'basisConfirmed', 'adsAttributionConfirmed', 'costsComplete', 'values']
    .map(key => [key, detail.draft[key]])), ...changes});
const save = async (actor, item, changes = {}) => ok(actor, `/indicators/${item.id}`, body(await current(actor, item), changes), 'PATCH');
const publish = async (actor, item) => ok(actor, `/indicators/${item.id}/publish`, {expectedVersion: (await current(actor, item)).draftVersion});
const changeStatus = async (actor, item, status) => ok(actor, `/indicators/${item.id}/status`,
  {expectedVersion: (await current(actor, item)).draftVersion, status, reason: 'Alteração justificada para ensaio.'});

async function assertDenied(actor, item) {
  assert.equal((await request(actor, `/indicators/${item.id}`)).status, 404);
  assert.ok(!(await ok(actor, '/indicators')).some(value => value.id === item.id));
}

before(async () => {
  await app.start();
  ({admin, mentor, mentor2, mentee, mentee2} = await app.accounts());
  const program = (await ok(admin, '/programs'))[0];
  own = await app.client(admin, program.id, mentor.user.id, mentee.user.id, 'Indicadores próprios');
  other = await app.client(admin, program.id, mentor2.user.id, mentee2.user.id, 'Indicadores de outra carteira');
  evolutionClient = await app.client(admin, program.id, mentor.user.id, mentee.user.id, 'Evolução histórica');
  external = await app.externalOrganization();
  foreign = await app.client(external.admin, external.programId, external.mentorId, null, 'Indicadores de outra organização');
  plan = await createPlan(mentor, own, 'Plano de melhoria mensurável');
  otherPlan = await createPlan(mentor2, other, 'Plano de outra carteira');
  foreignPlan = await createPlan(external.admin, foreign, 'Plano de outra organização');
  const source = await app.db('enrollments').where({id: own.enrollmentId}).first(), secondId = randomUUID();
  await app.db('enrollments').insert({...source, id: secondId});
  await app.db('assignments').insert({id: randomUUID(), organization_id: admin.user.organizationId,
    enrollment_id: secondId, mentor_id: mentor.user.id, assigned_by: admin.user.id, kind: 'primary', starts_at: new Date()});
  secondCyclePlan = await createPlan(mentor, {enrollmentId: secondId}, 'Mesmo cliente em outra contratação');
  report = await create(mentor, own, -1);
  otherReport = await create(mentor2, other, -1);
  foreignReport = await create(external.admin, foreign, -1);
});

test('Indicadores mensais: publicação, evolução, metas, importação e autorização', async t => {
  await t.test('período é único por contratação, meses futuros são recusados e histórico anterior ao contrato é aceito', async () => {
    const base = {enrollmentId: own.enrollmentId, period: period(-2), ...data()};
    const repeated = await Promise.all([request(mentor, '/indicators', base), request(mentor, '/indicators', base)]);
    assert.equal(repeated.filter(value => value.status >= 200 && value.status < 300).length, 1, JSON.stringify(repeated));
    assert.equal(repeated.filter(value => value.status === 409).length, 1);
    assert.equal((await request(mentor, '/indicators', {...base, period: period(1), periodStatus: 'partial'})).status, 400);
    assert.equal((await request(mentor, '/indicators', {...base, period: period(0)})).status, 400);
    partialReport = await create(mentor, own, 0, {periodStatus: 'partial'});
    const historical = await create(mentor, own, -36);
    await publish(mentor, historical);
    assert.equal((await current(mentee, historical)).period, period(-36));
    assert.equal((await request(mentor, '/indicators', {...base, period: period(-5), sourceType: 'sync'})).status, 400);
    assert.equal((await request(mentee, '/indicators', {...base, period: period(-5)})).status, 403);
  });

  await t.test('rascunhos são privados e não atravessam carteira, organização ou perfil', async () => {
    await assertDenied(mentee, report);
    for (const actor of [mentor, mentee]) {
      await assertDenied(actor, otherReport);
      assert.deepEqual(await ok(actor, `/indicators?enrollmentId=${other.enrollmentId}`), []);
    }
    for (const actor of [admin, mentor, mentee]) await assertDenied(actor, foreignReport);
    const detail = await current(mentor, report);
    assert.equal((await request(mentee, `/indicators/${report.id}`, body(detail), 'PATCH')).status, 403);
    assert.equal((await request(mentee, `/indicators/${report.id}/publish`, {expectedVersion: detail.draftVersion})).status, 403);
    assert.equal((await request({...mentor, csrfToken: 'inválido'}, `/indicators/${report.id}`, body(detail), 'PATCH')).status, 403);
    assert.equal((await request(mentor, `/indicators/${report.id}`, {...body(detail), sourceType: 'csv'}, 'PATCH')).status, 400);
    assert.equal((await request(mentor, `/indicators/${report.id}`, {...body(detail), organizationId: external.organizationId}, 'PATCH')).status, 400);
    assert.equal((await request(mentor, '/indicators/identificador-inválido')).status, 400);
  });

  await t.test('duas edições simultâneas preservam uma versão e rejeitam a atualização perdida', async () => {
    const before = await current(mentor, report);
    const results = await Promise.all([
      request(mentor, `/indicators/${report.id}`, body(before, {notes: 'Revisão simultânea A'}), 'PATCH'),
      request(mentor, `/indicators/${report.id}`, body(before, {notes: 'Revisão simultânea B'}), 'PATCH'),
    ]);
    assert.equal(results.filter(value => value.status >= 200 && value.status < 300).length, 1, JSON.stringify(results));
    assert.equal(results.filter(value => value.status === 409).length, 1);
    const after = await current(mentor, report);
    assert.equal(after.draftVersion, before.draftVersion + 1);
    assert.ok(['Revisão simultânea A', 'Revisão simultânea B'].includes(after.draft.notes));
    assert.equal((await request(mentor, `/indicators/${report.id}/publish`, {expectedVersion: before.draftVersion})).status, 409);
  });

  await t.test('campos ausentes permanecem nulos e relações impossíveis não entram no consolidado', async () => {
    const original = await current(mentor, report);
    for (const changes of [
      {values: values({revenue: '-1.00'})}, {values: values({orders: -1})}, {values: values({visits: 1.5})},
      {values: values({revenue: 123})}, {values: values({revenue: '1.234,56'})},
      {values: values({outOfStockSkus: 11})}, {values: values({completeListings: 11})},
      {values: values({totalCosts: null}), costsComplete: true},
    ]) assert.equal((await request(mentor, `/indicators/${report.id}`, body(original, changes), 'PATCH')).status, 400, JSON.stringify(changes));
    const missing = await create(mentor, own, -3, {costsComplete: false, values: {revenue: '0.00', orders: 0}});
    const detail = await current(mentor, missing);
    assert.equal(detail.draft.values.revenue, '0.00'); assert.equal(detail.draft.values.orders, 0);
    assert.equal(detail.draft.values.visits, null); assert.equal(detail.draft.values.claims, null);
    await publish(mentor, missing);
    const metric = (await current(mentee, missing)).published.metrics;
    assert.equal(metric.averageTicket.value, null); assert.ok(metric.averageTicket.reason);
    assert.equal(metric.conversionRate.value, null); assert.ok(metric.conversionRate.reason);
    assert.equal(metric.estimatedMargin.value, null); assert.ok(metric.estimatedMargin.reason);
    assert.equal(metric.revenue.value, 0); assert.equal(metric.orders.value, 0);
    const empty = await create(mentor, own, -5, {costsComplete: false, values: {}});
    assert.equal((await request(mentor, `/indicators/${empty.id}/publish`, {expectedVersion: (await current(mentor, empty)).draftVersion})).status, 400);
    assert.deepEqual(await current(mentor, report), original);
  });

  let firstPublic;
  await t.test('seis derivados usam dados confirmados e publicação não altera contato ou progresso do plano', async () => {
    const contactBefore = (await app.db('enrollments').where({id: own.enrollmentId}).first()).last_contact_at;
    const planBefore = await ok(mentor, `/plans/${plan.id}`);
    await publish(mentor, report);
    firstPublic = await current(mentee, report);
    assert.equal(firstPublic.sourceType, 'manual');
    const metrics = firstPublic.published.metrics;
    for (const [key, value] of Object.entries({averageTicket: 100, conversionRate: 10, roas: 4, acos: 25, tacos: 10, estimatedMargin: 20})) {
      assert.equal(Number(metrics[key].value), value, key); assert.equal(metrics[key].reason, null);
    }
    for (const field of ['draft', 'draftVersion', 'history', 'hasUnpublishedChanges']) assert.ok(!(field in firstPublic));
    assert.equal((await app.db('enrollments').where({id: own.enrollmentId}).first()).last_contact_at, contactBefore);
    assert.equal((await ok(mentor, `/plans/${plan.id}`)).lastProgressAt, planBefore.lastProgressAt);
    const unconfirmed = await create(mentor, own, -4, {basisConfirmed: false, adsAttributionConfirmed: false, costsComplete: false});
    await publish(mentor, unconfirmed);
    const unreliable = (await current(mentee, unconfirmed)).published.metrics;
    for (const key of ['averageTicket', 'conversionRate', 'roas', 'acos', 'tacos', 'estimatedMargin']) {
      assert.equal(unreliable[key].value, null, key); assert.ok(unreliable[key].reason, key);
    }
  });

  await t.test('correção exige motivo, mantém revisão pública imutável e permite margem negativa legítima', async () => {
    const before = await current(mentor, report), secret = `Minuta reservada ${app.runId}`;
    assert.equal((await request(mentor, `/indicators/${report.id}`, body(before, {notes: secret}), 'PATCH')).status, 400);
    await save(mentor, report, {reason: 'Corrigir custos inicialmente incompletos.', notes: secret, values: values({totalCosts: '1200.00'})});
    assert.deepEqual(await current(mentee, report), firstPublic);
    for (const path of ['/indicators', `/indicators/evolution?enrollmentId=${own.enrollmentId}&from=${period(-1)}&to=${period(0)}`, '/notifications']) {
      assert.ok(!JSON.stringify(await ok(mentee, path)).includes(secret), path);
    }
    await publish(mentor, report);
    const second = await current(mentee, report);
    assert.equal(second.published.version, 2);
    assert.equal(Number(second.published.metrics.estimatedMargin.value), -20);
    assert.deepEqual((await current(mentee, report, 1)).published, firstPublic.published);
    assert.equal((await current(mentor, report)).sourceType, 'manual');
    const revisionsBefore = await app.db('indicator_revisions').where({indicator_id: report.id}).count('* as count').first();
    await publish(mentor, report);
    assert.deepEqual(await app.db('indicator_revisions').where({indicator_id: report.id}).count('* as count').first(), revisionsBefore);
    const staff = await current(mentor, report);
    assert.ok(JSON.stringify(staff.history).includes('Corrigir custos inicialmente incompletos.'));
  });

  await t.test('evolução mantém lacunas e compara somente o mês imediatamente anterior com base compatível', async () => {
    for (const [offset, changes] of [
      [-8, {basisConfirmed: false}], [-7, {}], [-5, {values: values({revenue: '2000.00'})}],
      [-4, {values: values({revenue: '3000.00'})}], [-3, {sourceLabel: 'Outra base declarada'}],
      [-2, {values: values({revenue: '0.00'})}], [-1, {}], [0, {periodStatus: 'partial'}],
    ]) { const item = await create(mentor, evolutionClient, offset, changes); await publish(mentor, item); }
    const result = await evolution(mentee, evolutionClient, -7, 0);
    assert.equal(result.points.length, 8);
    const at = offset => result.points.find(value => value.period === period(offset));
    assert.equal(at(-7).comparison.comparable, false); assert.equal(at(-7).comparison.reason, 'basis_unconfirmed');
    assert.equal(at(-6).data, null);
    assert.equal(at(-5).comparison.comparable, false); assert.ok(at(-5).comparison.reason);
    assert.equal(at(-4).comparison.comparable, true);
    assert.equal(Number(at(-4).comparison.metrics.revenue.absoluteChange), 1000);
    assert.equal(Number(at(-4).comparison.metrics.revenue.percentChange), 50);
    assert.equal(at(-4).comparison.metrics.conversionRate.percentChange, null);
    assert.equal(at(-3).comparison.comparable, false);
    assert.equal(at(-2).comparison.comparable, false);
    assert.equal(at(-1).comparison.comparable, true);
    assert.equal(Number(at(-1).comparison.metrics.revenue.absoluteChange), 1000);
    assert.equal(at(-1).comparison.metrics.revenue.percentChange, null);
    assert.equal(at(-1).comparison.metrics.revenue.reason, 'zero_baseline');
    assert.equal(at(0).comparison.comparable, false);
  });

  await t.test('exportação mensal usa apenas publicações autorizadas, preserva zero e lacunas e protege fórmulas', async () => {
    const exportProgram = (await ok(admin, '/programs'))[0];
    const exportClient = await app.client(admin, exportProgram.id, mentor.user.id, mentee.user.id, 'Exportação mensal isolada');
    const formula = '=HYPERLINK("https://example.invalid";"Base da loja")';
    const published = await create(mentor, exportClient, -1, {sourceLabel: formula, values: values({totalCosts: '1200.00'})});
    await publish(mentor, published);
    const secret = `Correção privada ${app.runId}`;
    await save(mentor, published, {sourceLabel: secret, notes: secret, reason: secret, values: values({revenue: '99999.00'})});
    await create(mentor, exportClient, -4, {sourceLabel: `Rascunho ${secret}`});
    const archived = await create(mentor, exportClient, -5, {sourceLabel: `Arquivado ${secret}`});
    await publish(mentor, archived); await changeStatus(mentor, archived, 'archived');
    const zero = await create(mentor, exportClient, -2, {costsComplete: false, values: {revenue: '0.00', orders: 0}});
    await publish(mentor, zero);
    const partial = await create(mentor, exportClient, 0, {periodStatus: 'partial'}); await publish(mentor, partial);
    const persistedBefore = await persistedSnapshot();
    let expectedContent;
    for (const actor of [admin, mentor, mentee]) {
      const response = await exportCsv(actor, exportClient);
      assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /text\/csv/);
      assert.match(response.headers.get('content-disposition'), /attachment; filename="evolucao-/);
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
      const content = bytes.toString('utf8');
      if (expectedContent) assert.equal(content, expectedContent); else expectedContent = content;
      assert.ok(!content.includes(secret)); assert.ok(!content.includes('99999'));
      assert.ok(!content.includes('expectedVersion')); assert.ok(!content.includes('history'));
      const rows = content.slice(1).trimEnd().split('\r\n').map(line =>
        [...line.matchAll(/"((?:[^"]|"")*)"(?:;|$)/g)].map(match => match[1].replaceAll('""', '"')));
      assert.equal(rows.length, 7); assert.ok(rows.every(row => row.length === 23));
      assert.deepEqual(rows[0].slice(0, 4), ['Período', 'Situação', 'Base dos dados', 'Versão publicada']);
      assert.equal(rows[0][4], 'Faturamento de vendas (R$)'); assert.equal(rows[0][5], 'Pedidos (quantidade)');
      assert.equal(rows[0][17], 'Ticket médio (R$)'); assert.equal(rows[0][19], 'ROAS (vezes)');
      assert.equal(rows[0][22], 'Margem estimada (%)');
      for (const offset of [-5, -4, -3]) {
        const row = rows.find(row => row[0] === period(offset));
        assert.equal(row[1], 'Sem publicação'); assert.ok(row.slice(2).every(cell => cell === 'Não informado'));
      }
      const zeroRow = rows.find(row => row[0] === period(-2));
      assert.equal(zeroRow[4], '0,00'); assert.equal(zeroRow[5], '0'); assert.equal(zeroRow[6], 'Não informado');
      assert.ok(zeroRow.slice(17).every(cell => cell === 'Não informado'));
      const known = rows.find(row => row[0] === period(-1));
      assert.equal(known[1], 'Fechado'); assert.equal(known[2], "'" + formula); assert.equal(known[3], '1');
      assert.equal(known[4], '1000,00'); assert.equal(known[9], '1200,00'); assert.equal(known[22], "'-20");
      assert.equal(rows.find(row => row[0] === period(0))[1], 'Parcial');
    }
    assert.equal(await persistedSnapshot(), persistedBefore);
    for (const actor of [admin, mentor, mentee]) assert.equal((await exportCsv(actor, foreign)).status, 404);
    for (const actor of [mentor2, mentee2, external.admin]) assert.equal((await exportCsv(actor, exportClient)).status, 404);
    assert.equal((await fetch(exportUrl(exportClient))).status, 401);
    assert.equal((await exportCsv(mentee, exportClient, -36, 0)).status, 400);
    assert.equal((await exportCsv(mentee, exportClient, 0, -1)).status, 400);
  });

  await t.test('metas usam somente valores publicados, aceitam zero e margem negativa sem progresso artificial', async () => {
    const createGoal = (metricKey, target, direction, offset = -1) => ok(mentor, '/indicator-goals',
      {enrollmentId: own.enrollmentId, period: period(offset), metricKey, target, direction, planId: plan.id, notes: 'Objetivo mensal acordado.'});
    goal = await createGoal('revenue', '900.00', 'at_least');
    assert.equal((await goalDetail(mentee, goal)).evaluation.status, 'achieved');
    const zero = await createGoal('claims', '0', 'at_most');
    const zeroDetail = await goalDetail(mentee, zero);
    assert.equal(zeroDetail.evaluation.actual, 0); assert.equal(zeroDetail.evaluation.target, 0);
    assert.equal(zeroDetail.evaluation.difference, 0); assert.equal(zeroDetail.evaluation.status, 'achieved');
    assert.ok(!('progressPercent' in zeroDetail.evaluation));
    const negative = await createGoal('estimatedMargin', '-10', 'at_least');
    const negativeDetail = await goalDetail(mentee, negative);
    assert.equal(negativeDetail.evaluation.actual, -20); assert.equal(negativeDetail.evaluation.difference, -10);
    assert.equal(negativeDetail.evaluation.status, 'not_achieved');
    const partial = await createGoal('revenue', '900.00', 'at_least', 0);
    assert.equal((await goalDetail(mentee, partial)).evaluation.status, 'not_informed');
    await publish(mentor, partialReport);
    assert.equal((await goalDetail(mentee, partial)).evaluation.status, 'in_progress');
    assert.equal((await goalDetail(mentee, partial)).evaluation.currentlyMeets, true);
    const future = await createGoal('orders', '20', 'at_least', 1);
    assert.equal((await goalDetail(mentee, future)).evaluation.status, 'not_informed');
    const previousPublic = (await goalDetail(mentee, goal)).evaluation;
    await save(mentor, report, {reason: 'Conferência de valor ainda não publicada.', values: values({revenue: '10.00', totalCosts: '1200.00'})});
    assert.deepEqual((await goalDetail(mentee, goal)).evaluation, previousPublic);
    await save(mentor, report, {reason: 'Restaurar o valor confirmado para o ensaio.', values: values({totalCosts: '1200.00'})});
  });

  await t.test('metas são únicas, exigem plano ativo da mesma contratação e têm edição concorrente controlada', async () => {
    const base = {enrollmentId: own.enrollmentId, period: period(-1), metricKey: 'orders', target: '15', direction: 'at_least'};
    for (const planId of [otherPlan.id, foreignPlan.id, secondCyclePlan.id]) {
      assert.ok([400, 404].includes((await request(admin, '/indicator-goals', {...base, planId})).status));
    }
    assert.equal((await request(mentee, '/indicator-goals', base)).status, 403);
    assert.equal((await request(mentor, '/indicator-goals', {...base, target: '-1'})).status, 400);
    assert.equal((await request(mentor, '/indicator-goals', {...base, target: '1.5'})).status, 400);
    await ok(mentor, `/plans/${plan.id}`, {status: 'draft'}, 'PATCH');
    assert.equal((await request(mentor, '/indicator-goals', {...base, planId: plan.id})).status, 400);
    await ok(mentor, `/plans/${plan.id}`, {status: 'active'}, 'PATCH');
    const repeated = await Promise.all([request(mentor, '/indicator-goals', base), request(mentor, '/indicator-goals', base)]);
    assert.equal(repeated.filter(value => value.status >= 200 && value.status < 300).length, 1, JSON.stringify(repeated));
    assert.equal(repeated.filter(value => value.status === 409).length, 1);
    const before = await goalDetail(mentor, goal);
    const changes = await Promise.all([
      request(mentor, `/indicator-goals/${goal.id}`, {expectedVersion: before.version, target: '800.00', reason: 'Ajuste acordado A.'}, 'PATCH'),
      request(mentor, `/indicator-goals/${goal.id}`, {expectedVersion: before.version, target: '850.00', reason: 'Ajuste acordado B.'}, 'PATCH'),
    ]);
    assert.equal(changes.filter(value => value.status >= 200 && value.status < 300).length, 1, JSON.stringify(changes));
    assert.equal(changes.filter(value => value.status === 409).length, 1);
    const next = await goalDetail(mentor, goal);
    assert.equal(next.version, before.version + 1);
    assert.ok(JSON.stringify(next.history).includes('Ajuste acordado'));
    const publicGoal = await goalDetail(mentee, goal); assert.ok(!('history' in publicGoal));
    assert.equal((await request(mentee, `/indicator-goals/${goal.id}`, {expectedVersion: next.version, target: '0', reason: 'Sem permissão.'}, 'PATCH')).status, 403);
    assert.equal((await request({...mentor, csrfToken: 'inválido'}, `/indicator-goals/${goal.id}`, {expectedVersion: next.version, target: '0', reason: 'Sem CSRF.'}, 'PATCH')).status, 403);
    assert.equal((await request(mentor2, `/indicator-goals/${goal.id}`)).status, 404);
    assert.equal((await request(external.admin, `/indicator-goals/${goal.id}`)).status, 404);
  });

  await t.test('prévia CSV aceita UTF-8, aspas e decimal local, classifica conflitos e não grava nenhum dado ou auditoria', async () => {
    const response = await fetch(app.origin + '/api/indicators/csv-template', {headers: {Cookie: mentor.cookie}});
    assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /text\/csv/);
    assert.match(response.headers.get('content-disposition'), /attachment/);
    const template = await response.text(); assert.ok(template.includes('periodo;situacao;origem;'));
    assert.equal((await fetch(app.origin + '/api/indicators/csv-template', {headers: {Cookie: mentee.cookie}})).status, 403);
    const header = ['periodo', 'situacao', 'origem', 'observacoes', 'base_confirmada', 'faturamento', 'pedidos', 'visitas', 'custos_completos', 'custos_totais', 'skus', 'skus_sem_estoque'];
    const source = 'Base "loja"; mensal', note = 'Conferência de preços\nSegunda linha preservada.';
    const text = csv(header, [
      [period(-8), 'fechado', source, note, 'sim', '1234,56', '4', '40', 'sim', '1000.00', '10', '2'],
      [period(-9), 'fechado', 'Base dos zeros', '', 'sim', '0.00', '0', '', 'não', '', '', ''],
      [period(-1), 'fechado', source, '', 'sim', '900,00', '9', '', 'não', '', '', ''],
      [period(-8), 'fechado', source, 'Repetido', 'sim', '1234,56', '4', '', 'não', '', '', ''],
      [period(-10), 'fechado', source, 'Custos faltando', 'sim', '100,00', '1', '', 'sim', '', '', ''],
      [period(1), 'parcial', source, 'Futuro', 'sim', '100,00', '1', '', 'não', '', '', ''],
      [period(-11), 'fechado', source, 'Estoque inválido', 'sim', '100,00', '1', '', 'não', '', '2', '3'],
    ]);
    const before = await persistedSnapshot(), result = await preview(mentor, text);
    assert.deepEqual(result.errors, []); assert.deepEqual(result.counts, {create: 1, conflict: 1, invalid: 5});
    assert.equal(result.rows[0].classification, 'invalid'); assert.equal(result.rows[3].classification, 'invalid');
    assert.equal(result.rows[0].data.sourceLabel, source); assert.equal(result.rows[0].data.notes, note);
    assert.equal(result.rows[0].data.values.revenue, '1234.56');
    assert.equal(result.rows[0].data.values.totalCosts, '1000.00');
    assert.equal(result.rows[0].data.values.orders, 4);
    assert.equal(result.rows[1].data.values.revenue, '0.00'); assert.equal(result.rows[1].data.values.orders, 0);
    assert.equal(result.rows[1].data.values.visits, null); assert.equal(result.rows[1].data.values.claims, null);
    assert.equal(result.rows[2].existingId, report.id);
    assert.ok(result.rows.slice(3).every(value => value.errors.length > 0));
    assert.equal(await persistedSnapshot(), before);
    const manualEquivalent = await request(mentor, '/indicators', {enrollmentId: own.enrollmentId, ...result.rows[4].data});
    assert.equal(manualEquivalent.status, 400);
    assert.equal(await persistedSnapshot(), before);
  });

  await t.test('prévia limita tamanho e linhas, rejeita formato inválido e mantém autorização dos três perfis', async () => {
    const header = ['periodo', 'situacao', 'origem', 'faturamento'];
    const row = [period(-12), 'fechado', 'Base CSV', '1000,00'];
    const valid = csv(header, [row]), before = await persistedSnapshot();
    for (const text of [
      csv(header, []),
      csv(['periodo', 'situacao', 'origem', 'coluna_inventada'], [row]),
      'periodo;situacao;origem\n"aspas sem fechar',
      csv(header, Array.from({length: 201}, () => row)),
      'é'.repeat(33000),
    ]) { const result = await preview(mentor, text); assert.ok(result.errors.length > 0); assert.equal(result.rows.length, 0); }
    assert.equal((await request(mentor, '/indicators/csv-preview', {enrollmentId: own.enrollmentId, csvText: 'x'.repeat(65537)})).status, 400);
    const badMoney = await preview(mentor, csv(header, [[period(-12), 'fechado', 'Base CSV', '1.000,00']]));
    assert.equal(badMoney.rows[0].classification, 'invalid');
    assert.equal((await request(mentee, '/indicators/csv-preview', {enrollmentId: own.enrollmentId, csvText: valid})).status, 403);
    assert.equal((await request(mentor, '/indicators/csv-preview', {enrollmentId: other.enrollmentId, csvText: valid})).status, 404);
    for (const actor of [admin, mentor]) assert.equal((await request(actor, '/indicators/csv-preview', {enrollmentId: foreign.enrollmentId, csvText: valid})).status, 404);
    assert.equal((await request({...mentor, csrfToken: 'inválido'}, '/indicators/csv-preview', {enrollmentId: own.enrollmentId, csvText: valid})).status, 403);
    assert.equal(await persistedSnapshot(), before);
  });

  await t.test('arquivamento conserva revisões e contratos pausados permitem somente leitura', async () => {
    const unpublished = (await ok(mentor, `/indicators?enrollmentId=${own.enrollmentId}`)).find(value => value.period === period(-2));
    await changeStatus(mentor, unpublished, 'archived');
    await assertDenied(mentee, unpublished);
    assert.equal((await request(mentor, '/indicators', {enrollmentId: own.enrollmentId, period: period(-2), ...data()})).status, 409);
    const detail = await current(mentor, report);
    assert.equal((await request(mentor, `/indicators/${report.id}/status`, {expectedVersion: detail.draftVersion, status: 'archived'})).status, 400);
    await changeStatus(mentor, report, 'archived');
    assert.equal((await current(mentee, report)).status, 'archived');
    assert.equal((await request(mentor, `/indicators/${report.id}`, body(await current(mentor, report), {reason: 'Não pode alterar arquivado.'}), 'PATCH')).status, 400);
    assert.equal((await evolution(mentee, own, -1, -1)).points[0].data, null);
    await changeStatus(mentor, report, 'active');
    const target = await goalDetail(mentor, goal);
    assert.equal((await request(mentor, `/indicator-goals/${goal.id}/status`, {expectedVersion: target.version, status: 'archived'})).status, 400);
    await ok(mentor, `/indicator-goals/${goal.id}/status`, {expectedVersion: target.version, status: 'archived', reason: 'Objetivo substituído com acordo.'});
    assert.equal((await goalDetail(mentee, goal)).status, 'archived');
    const archived = await goalDetail(mentor, goal);
    await ok(mentor, `/indicator-goals/${goal.id}/status`, {expectedVersion: archived.version, status: 'active', reason: 'Objetivo retomado.'});
    await ok(admin, `/enrollments/${own.enrollmentId}`, {expectedVersion: (await ok(admin, `/journey/enrollments/${own.enrollmentId}`)).journeyVersion, status: 'paused', reason: 'Pausa para ensaio de leitura.'}, 'PATCH');
    try {
      assert.equal((await request(mentor, `/indicators/${report.id}`, body(await current(mentor, report), {reason: 'Tentativa durante pausa.'}), 'PATCH')).status, 400);
      assert.equal((await request(mentor, `/indicators/${report.id}/publish`, {expectedVersion: (await current(mentor, report)).draftVersion})).status, 400);
      assert.equal((await request(mentor, `/indicator-goals/${goal.id}`, {expectedVersion: (await goalDetail(mentor, goal)).version, target: '950.00', reason: 'Tentativa durante pausa.'}, 'PATCH')).status, 400);
      assert.equal((await current(mentee, report)).published.version, 2);
    } finally { await ok(admin, `/enrollments/${own.enrollmentId}`, {expectedVersion: (await ok(admin, `/journey/enrollments/${own.enrollmentId}`)).journeyVersion, status: 'active', reason: 'Ensaio de leitura concluído.'}, 'PATCH'); }
  });

  await t.test('troca de mentor, cobertura expirada e retirada da empresa revogam os acessos imediatamente', async () => {
    await ok(admin, `/enrollments/${own.enrollmentId}/assignments`, {mentorId: mentor2.user.id, kind: 'primary'});
    await assertDenied(mentor, report);
    assert.equal((await exportCsv(mentor, own)).status, 404);
    assert.equal((await request(mentor, `/indicator-goals/${goal.id}`)).status, 404);
    assert.equal((await request(mentor, `/indicators/evolution?enrollmentId=${own.enrollmentId}&from=${period(-1)}&to=${period(0)}`)).status, 404);
    assert.equal((await request(mentor, '/indicators/csv-preview', {enrollmentId: own.enrollmentId, csvText: 'periodo;situacao;origem'})).status, 404);
    assert.equal((await current(mentor2, report)).published.version, 2);
    await ok(admin, `/enrollments/${own.enrollmentId}/assignments`, {mentorId: mentor.user.id, kind: 'coverage', endsAt: new Date(Date.now() + 3600e3).toISOString()});
    assert.equal((await request(mentor, `/indicators/${report.id}`)).status, 200);
    await app.db('assignments').where({enrollment_id: own.enrollmentId, mentor_id: mentor.user.id, kind: 'coverage'}).update({starts_at: new Date(Date.now() - 3600e3), ends_at: new Date(Date.now() - 1000)});
    await assertDenied(mentor, report);
    assert.equal((await exportCsv(mentor, own)).status, 404);
    assert.equal((await request(mentor, `/indicator-goals/${goal.id}`)).status, 404);
    await ok(admin, `/enrollments/${own.enrollmentId}/assignments`, {mentorId: mentor.user.id, kind: 'primary'});
    await app.db('client_members').where({client_id: own.id, user_id: mentee.user.id}).delete();
    try {
      await assertDenied(mentee, report);
      assert.equal((await exportCsv(mentee, own)).status, 404);
      assert.equal((await request(mentee, `/indicator-goals/${goal.id}`)).status, 404);
      assert.ok(!(await ok(mentee, '/indicator-goals')).some(value => value.id === goal.id));
    } finally { await app.db('client_members').insert({organization_id: admin.user.organizationId, client_id: own.id, user_id: mentee.user.id}); }
  });

  await t.test('restrições do PostgreSQL impedem registros e metas com organização ou contratação incompatível', async () => {
    const row = await app.db('indicators').where({id: report.id}).first();
    await assert.rejects(() => app.db('indicators').insert({...row, id: randomUUID(), enrollment_id: foreign.enrollmentId, period: period(-20)}), error => error.code === '23503');
    const target = await app.db('indicator_goals').where({id: goal.id}).first();
    await assert.rejects(() => app.db('indicator_goals').insert({...target, id: randomUUID(), period: period(-20), plan_id: secondCyclePlan.id}), error => error.code === '23503');
    const revision = await app.db('indicator_revisions').where({indicator_id: report.id, version: 1}).first();
    assert.equal(revision.snapshot.values.revenue, '1000.00');
    assert.equal(revision.snapshot.values.totalCosts, '800.00');
    assert.equal(row.source_type, 'manual');
  });
});

after(() => app.stop());
