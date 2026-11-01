import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {integrationEnvironment} from './helpers/integration-environment.mjs';

const app = integrationEnvironment({database: 'elo_diagnosticscheck', port: 3339, redisDb: 6});
const {ok, request} = app;
let admin, mentor, mentor2, mentee, mentee2, own, other, external, foreign;
let template, diagnosis, otherDiagnosis, foreignDiagnosis, plan, otherPlan, foreignPlan, secondCyclePlan;
const finding = (extra = {}) => ({id: randomUUID(), area: 'pricing', prompt: 'Quais custos entram no cálculo?', assessment: 'attention',
  observation: 'O custo de frete ainda não está considerado.', recommendation: 'Recalcular a margem dos kits incluindo o frete.', priority: 'high', ...extra});
const current = (actor, item, version) => ok(actor, `/diagnoses/${item.id}${version ? `?version=${version}` : ''}`);
const draftBody = (value, changes = {}) => ({expectedVersion: value.draftVersion, title: value.draft.title,
  context: value.draft.context, maturity: value.draft.maturity, findings: value.draft.findings, ...changes});
const save = async (actor, item, changes = {}) => ok(actor, `/diagnoses/${item.id}`, draftBody(await current(actor, item), changes), 'PATCH');
const publish = async (actor, item) => ok(actor, `/diagnoses/${item.id}/publish`, {expectedVersion: (await current(actor, item)).draftVersion});
async function create(actor, c, title, extra = {}) {
  return ok(actor, '/diagnoses', {enrollmentId: c.enrollmentId, title: `${title} ${app.runId}`, context: 'Diagnóstico técnico do negócio atendido.', findings: [finding()], ...extra});
}
async function createPlan(actor, c, title) {
  return ok(actor, '/plans', {enrollmentId: c.enrollmentId, title, objective: 'Executar melhoria verificada pelo diagnóstico.'});
}

before(async () => {
  await app.start();
  ({admin, mentor, mentor2, mentee, mentee2} = await app.accounts());
  const program = (await ok(admin, '/programs'))[0];
  own = await app.client(admin, program.id, mentor.user.id, mentee.user.id, 'Diagnóstico próprio');
  other = await app.client(admin, program.id, mentor2.user.id, mentee2.user.id, 'Diagnóstico outra carteira');
  external = await app.externalOrganization();
  foreign = await app.client(external.admin, external.programId, external.mentorId, null, 'Diagnóstico outra organização');
  template = await ok(admin, '/diagnosis-templates', {name: `Modelo técnico ${app.runId}`, description: 'Modelo curto e adaptável.',
    areas: [{area: 'catalog', prompt: 'Revisar títulos e fichas.'}, {area: 'pricing', prompt: 'Revisar custos e margem.'}]});
  diagnosis = await create(mentor, own, 'Principal');
  otherDiagnosis = await create(mentor2, other, 'Outra carteira');
  foreignDiagnosis = await create(external.admin, foreign, 'Outra organização');
  plan = await createPlan(mentor, own, 'Plano já existente');
  otherPlan = await createPlan(mentor2, other, 'Plano outra carteira');
  foreignPlan = await createPlan(external.admin, foreign, 'Plano externo');
  const base = await app.db('enrollments').where({id: own.enrollmentId}).first(), nextId = randomUUID();
  await app.db('enrollments').insert({...base, id: nextId});
  await app.db('assignments').insert({id: randomUUID(), organization_id: admin.user.organizationId, enrollment_id: nextId,
    mentor_id: mentor.user.id, assigned_by: admin.user.id, kind: 'primary', starts_at: new Date()});
  secondCyclePlan = await createPlan(mentor, {enrollmentId: nextId}, 'Mesmo cliente, outra contratação');
});

test('Diagnósticos técnicos: privacidade, versões, modelos e vínculo com planos', async t => {
  await t.test('modelos globais pertencem à administração e sua mudança não altera a instância', async () => {
    const model = (await ok(admin, '/diagnosis-templates')).find(value => value.id === template.id);
    assert.ok(model); assert.ok((await ok(mentor, '/diagnosis-templates')).some(value => value.id === template.id));
    assert.equal((await request(mentee, '/diagnosis-templates')).status, 403);
    const templateBody = {name: 'Sem permissão', description: '', areas: [{area: 'catalog', prompt: 'Revisar'}]};
    assert.equal((await request(mentor, '/diagnosis-templates', templateBody)).status, 403);
    assert.equal((await request(mentee, '/diagnosis-templates', templateBody)).status, 403);
    assert.equal((await request(mentor, `/diagnosis-templates/${template.id}`, {expectedVersion: model.version, name: 'Não pode alterar'}, 'PATCH')).status, 403);
    const instance = await ok(mentor, '/diagnoses', {enrollmentId: own.enrollmentId, templateId: template.id, title: 'Modelo adaptado ao cliente'});
    const before = await current(mentor, instance);
    assert.equal(before.draft.findings.length, 2);
    assert.ok(before.draft.findings.every(value => value.assessment === 'not_assessed'));
    const ids = before.draft.findings.map(value => value.id);
    await ok(admin, `/diagnosis-templates/${template.id}`, {expectedVersion: model.version, name: 'Modelo revisado', areas: [{area: 'stock', prompt: 'Nova pergunta de estoque.'}]}, 'PATCH');
    const after = await current(mentor, instance);
    assert.deepEqual(after.templateSnapshot, before.templateSnapshot);
    assert.deepEqual(after.draft.findings, before.draft.findings);
    await save(mentor, instance, {findings: before.draft.findings.map(value => ({...value, prompt: 'Pergunta adaptada apenas nesta empresa.'}))});
    assert.deepEqual((await current(mentor, instance)).draft.findings.map(value => value.id), ids);
    assert.equal((await ok(admin, '/diagnosis-templates')).find(value => value.id === template.id).areas[0].prompt, 'Nova pergunta de estoque.');
  });

  await t.test('rascunhos não existem para mentorados e consultas não atravessam carteira ou organização', async () => {
    assert.equal((await request(mentee, `/diagnoses/${diagnosis.id}`)).status, 404);
    assert.ok(!(await ok(mentee, '/diagnoses')).some(value => value.id === diagnosis.id));
    for (const actor of [mentor, mentee]) {
      assert.equal((await request(actor, `/diagnoses/${otherDiagnosis.id}`)).status, 404);
      assert.ok(!(await ok(actor, '/diagnoses')).some(value => value.id === otherDiagnosis.id));
      assert.deepEqual(await ok(actor, `/diagnoses?enrollmentId=${other.enrollmentId}`), []);
    }
    for (const actor of [admin, mentor, mentee]) assert.equal((await request(actor, `/diagnoses/${foreignDiagnosis.id}`)).status, 404);
    const body = {enrollmentId: own.enrollmentId, title: 'Não permitido', context: '', findings: [finding()]};
    assert.equal((await request(mentee, '/diagnoses', body)).status, 403);
    const ownDraft = await current(mentor, diagnosis);
    assert.equal((await request(mentee, `/diagnoses/${diagnosis.id}`, draftBody(ownDraft), 'PATCH')).status, 403);
    assert.equal((await request(mentee, `/diagnoses/${diagnosis.id}/publish`, {expectedVersion: ownDraft.draftVersion})).status, 403);
    assert.equal((await request({...mentor, csrfToken: 'incorreto'}, `/diagnoses/${diagnosis.id}`, draftBody(ownDraft), 'PATCH')).status, 403);
    assert.equal((await request(mentor, `/diagnoses/${diagnosis.id}`, {...draftBody(ownDraft), organizationId: external.organizationId}, 'PATCH')).status, 400);
  });

  await t.test('salvamentos simultâneos usam versão esperada e não perdem alterações silenciosamente', async () => {
    const before = await current(mentor, diagnosis);
    const results = await Promise.all([
      request(mentor, `/diagnoses/${diagnosis.id}`, draftBody(before, {title: 'Revisão concorrente A'}), 'PATCH'),
      request(mentor, `/diagnoses/${diagnosis.id}`, draftBody(before, {title: 'Revisão concorrente B'}), 'PATCH'),
    ]);
    assert.equal(results.filter(value => value.status >= 200 && value.status < 300).length, 1, JSON.stringify(results));
    assert.equal(results.filter(value => value.status === 409).length, 1);
    const after = await current(mentor, diagnosis);
    assert.equal(after.draftVersion, before.draftVersion + 1);
    assert.ok(['Revisão concorrente A', 'Revisão concorrente B'].includes(after.draft.title));
    assert.equal((await request(mentor, `/diagnoses/${diagnosis.id}/publish`, {expectedVersion: before.draftVersion})).status, 409);
    assert.deepEqual(after.draft.findings.map(value => value.id), before.draft.findings.map(value => value.id));
  });

  await t.test('publicação exige contexto e avaliação com observação, mantendo áreas opcionais', async () => {
    const empty = await create(mentor, own, 'Diagnóstico incompleto', {context: '', findings: [finding({assessment: 'not_assessed', observation: '', recommendation: ''})]});
    assert.equal((await request(mentor, `/diagnoses/${empty.id}/publish`, {expectedVersion: (await current(mentor, empty)).draftVersion})).status, 400);
    await save(mentor, empty, {context: 'Agora há contexto, mas ainda nenhuma área avaliada.'});
    assert.equal((await request(mentor, `/diagnoses/${empty.id}/publish`, {expectedVersion: (await current(mentor, empty)).draftVersion})).status, 400);
    await save(mentor, empty, {findings: [finding({assessment: 'critical', observation: ''})]});
    const value = await current(mentor, empty);
    assert.equal((await request(mentor, `/diagnoses/${empty.id}/publish`, {expectedVersion: value.draftVersion})).status, 400);
    assert.equal((await request(mentor, `/diagnoses/${empty.id}`, draftBody(value, {findings: [finding({evidenceUrl: 'javascript:alert(1)'})]}), 'PATCH')).status, 400);
    const evaluated = finding({area: 'catalog', assessment: 'adequate', observation: 'Fichas técnicas completas.', recommendation: ''});
    const optional = finding({area: 'advertising', assessment: 'not_assessed', observation: '', recommendation: ''});
    await save(mentor, empty, {findings: [evaluated, optional]});
    await publish(mentor, empty);
    const published = (await current(mentee, empty)).published;
    assert.equal(published.findings.length, 2);
    assert.equal(published.findings.find(value => value.area === 'advertising').assessment, 'not_assessed');
    assert.equal(published.maturity, 'not_informed');
  });

  await t.test('limites de conteúdo e identificadores inválidos retornam erro controlado sem modificar o diagnóstico', async () => {
    const value = await current(mentor, diagnosis);
    const content = (count) => Array.from({length: count}, () => finding({observation: 'a'.repeat(9000), recommendation: 'b'.repeat(9000)}));
    assert.equal((await request(mentor, `/diagnoses/${diagnosis.id}`, draftBody(value, {findings: content(4)}), 'PATCH')).status, 400);
    assert.equal((await request(mentor, `/diagnoses/${diagnosis.id}`, draftBody(value, {findings: content(6)}), 'PATCH')).status, 413);
    assert.equal((await request(mentor, '/diagnoses/id-inválido')).status, 400);
    assert.equal((await request(mentor, `/diagnoses/${diagnosis.id}?version=inválida`)).status, 400);
    assert.deepEqual(await current(mentor, diagnosis), value);
  });

  let version1, primaryFinding;
  await t.test('nova minuta não muda título, contexto, achados ou metadados da visão pública', async () => {
    const beforeContact = (await app.db('enrollments').where({id: own.enrollmentId}).first()).last_contact_at;
    const beforeProgress = (await ok(mentor, `/plans/${plan.id}`)).lastProgressAt;
    await publish(mentor, diagnosis);
    version1 = await current(mentee, diagnosis); primaryFinding = version1.published.findings[0];
    assert.equal(version1.published.version, 1);
    for (const field of ['draft', 'draftVersion', 'history', 'templateSnapshot']) assert.ok(!(field in version1));
    const secret = `Segredo de minuta ${app.runId}`;
    await save(mentor, diagnosis, {title: secret, context: secret + ' contexto', maturity: 'scaling', findings: [{...primaryFinding, observation: secret + ' observação', recommendation: secret + ' recomendação'}]});
    assert.deepEqual(await current(mentee, diagnosis), version1);
    for (const path of ['/diagnoses', '/notifications', `/plans/${plan.id}`, `/clients/${own.id}`]) assert.ok(!JSON.stringify(await ok(mentee, path)).includes(secret), path);
    assert.equal((await app.db('enrollments').where({id: own.enrollmentId}).first()).last_contact_at, beforeContact);
    assert.equal((await ok(mentor, `/plans/${plan.id}`)).lastProgressAt, beforeProgress);
    assert.ok((await ok(mentee, '/diagnoses')).some(value => value.id === diagnosis.id));
  });

  await t.test('vínculo exige versão publicada e plano ativo da mesma contratação, inclusive entre ciclos do mesmo cliente', async () => {
    for (const planId of [otherPlan.id, foreignPlan.id, secondCyclePlan.id]) {
      const result = await request(admin, `/diagnoses/${diagnosis.id}/plans`, {planId, version: 1});
      assert.ok([400, 404].includes(result.status));
    }
    assert.equal((await request(mentee, `/diagnoses/${diagnosis.id}/plans`, {planId: plan.id, version: 1})).status, 403);
    assert.equal((await request(mentor, `/diagnoses/${diagnosis.id}/plans`, {planId: plan.id, version: 99})).status, 404);
    await ok(mentor, `/plans/${plan.id}`, {status: 'draft'}, 'PATCH');
    assert.equal((await request(mentor, `/diagnoses/${diagnosis.id}/plans`, {planId: plan.id, version: 1})).status, 400);
    await ok(mentor, `/plans/${plan.id}`, {status: 'active'}, 'PATCH');
    const beforeProgress = (await ok(mentor, `/plans/${plan.id}`)).lastProgressAt;
    await ok(mentor, `/diagnoses/${diagnosis.id}/plans`, {planId: plan.id, version: 1});
    await ok(mentor, `/diagnoses/${diagnosis.id}/plans`, {planId: plan.id, version: 1});
    assert.equal((await request(mentor, `/diagnoses/${diagnosis.id}/plans`, {planId: plan.id, version: 1, findingId: primaryFinding.id})).status, 409);
    const links = (await current(mentee, diagnosis)).linkedPlans.filter(value => value.planId === plan.id && value.version === 1);
    assert.equal(links.length, 1);
    assert.ok(!links[0].findingId);
    const target = await ok(mentee, `/plans/${plan.id}`);
    assert.equal(target.lastProgressAt, beforeProgress);
    assert.ok(target.diagnostics.some(value => value.diagnosisId === diagnosis.id && value.version === 1 && value.title === version1.published.title));
    assert.ok(!JSON.stringify(target.diagnostics).includes('Segredo de minuta'));
  });

  let createdPlanId;
  await t.test('criação concorrente de plano usa achado publicado, preserva origem e não duplica', async () => {
    const path = `/diagnoses/${diagnosis.id}/findings/${primaryFinding.id}/plan`;
    const beforeContact = (await app.db('enrollments').where({id: own.enrollmentId}).first()).last_contact_at;
    const results = await Promise.all([ok(mentor, path, {version: 1}), ok(mentor, path, {version: 1})]);
    createdPlanId = results[0].planId || results[0].id;
    assert.equal(results[1].planId || results[1].id, createdPlanId);
    const created = await ok(mentee, `/plans/${createdPlanId}`);
    assert.equal(created.baseline, primaryFinding.observation);
    assert.equal(created.objective, primaryFinding.recommendation);
    assert.equal(created.status, 'active'); assert.equal(created.progressPercent, null); assert.equal(created.tasks.length, 0);
    assert.ok(created.diagnostics.some(value => value.diagnosisId === diagnosis.id && value.version === 1 && value.findingId === primaryFinding.id));
    await ok(mentor, `/diagnoses/${diagnosis.id}/plans`, {planId: createdPlanId, version: 1, findingId: primaryFinding.id});
    assert.equal((await request(mentor, `/diagnoses/${diagnosis.id}/plans`, {planId: createdPlanId, version: 1})).status, 409);
    assert.ok(!JSON.stringify(created).includes('Segredo de minuta'));
    const links = await app.db('diagnosis_plan_links').where({diagnosis_id: diagnosis.id, finding_id: primaryFinding.id, created_from_finding: true});
    assert.equal(links.length, 1); assert.equal(links[0].plan_id, createdPlanId);
    assert.equal((await app.db('enrollments').where({id: own.enrollmentId}).first()).last_contact_at, beforeContact);
    assert.equal((await request(mentee, path, {version: 1})).status, 403);
  });

  await t.test('revisões publicadas são recuperáveis e publicação repetida não cria versão ou notificação', async () => {
    await save(mentor, diagnosis, {title: 'Diagnóstico revisado público', context: 'Revisão da margem com novos dados.', findings: [{...primaryFinding, observation: 'Frete incluído, falta validar impostos.', recommendation: 'Conferir impostos por regime tributário.'}]});
    await publish(mentor, diagnosis);
    const latest = await current(mentee, diagnosis); assert.equal(latest.published.version, 2);
    const old = await current(mentee, diagnosis, 1); assert.deepEqual(old.published, version1.published);
    assert.equal((await request(mentee, `/diagnoses/${diagnosis.id}?version=999`)).status, 404);
    assert.deepEqual(latest.revisions.map(value => value.version).sort(), [1, 2]);
    const count = async () => Number((await app.db('notifications').where({diagnosis_id: diagnosis.id}).count('* as n').first()).n);
    const before = await count(); await publish(mentor, diagnosis); assert.equal(await count(), before);
    assert.equal(Number((await app.db('diagnosis_revisions').where({diagnosis_id: diagnosis.id}).count('* as n').first()).n), 2);
    assert.equal((await ok(mentee, `/plans/${createdPlanId}`)).objective, primaryFinding.recommendation);
  });

  await t.test('arquivamento preserva publicações, exige motivo e matrícula pausada fica somente para leitura', async () => {
    let value = await current(mentor, diagnosis);
    assert.equal((await request(mentor, `/diagnoses/${diagnosis.id}/status`, {status: 'archived', expectedVersion: value.draftVersion})).status, 400);
    await ok(mentor, `/diagnoses/${diagnosis.id}/status`, {status: 'archived', reason: 'Ciclo técnico concluído.', expectedVersion: value.draftVersion});
    const archived = await current(mentee, diagnosis); assert.equal(archived.status, 'archived'); assert.equal(archived.published.version, 2);
    assert.ok((await ok(mentee, '/diagnoses')).some(row => row.id === diagnosis.id && row.status === 'archived'));
    value = await current(mentor, diagnosis);
    assert.equal((await request(mentor, `/diagnoses/${diagnosis.id}`, draftBody(value), 'PATCH')).status, 400);
    await ok(mentor, `/diagnoses/${diagnosis.id}/status`, {expectedVersion: (await ok(admin, `/journey/enrollments/${own.enrollmentId}`)).journeyVersion, status: 'active', reason: 'Nova revisão autorizada.', expectedVersion: value.draftVersion});
    const unpublished = await create(mentor, own, 'Nunca publicado');
    value = await current(mentor, unpublished);
    await ok(mentor, `/diagnoses/${unpublished.id}/status`, {status: 'archived', reason: 'Rascunho descartado com histórico.', expectedVersion: value.draftVersion});
    assert.equal((await request(mentee, `/diagnoses/${unpublished.id}`)).status, 404);
    await ok(admin, `/enrollments/${own.enrollmentId}`, {expectedVersion: (await ok(admin, `/journey/enrollments/${own.enrollmentId}`)).journeyVersion, status: 'paused', reason: 'Pausa para ensaio de leitura.'}, 'PATCH');
    try {
      value = await current(mentor, diagnosis);
      assert.equal((await request(mentor, `/diagnoses/${diagnosis.id}`, draftBody(value), 'PATCH')).status, 400);
      assert.equal((await request(mentor, `/diagnoses/${diagnosis.id}/publish`, {expectedVersion: value.draftVersion})).status, 400);
      assert.equal((await current(mentee, diagnosis)).published.version, 2);
    } finally { await ok(admin, `/enrollments/${own.enrollmentId}`, {expectedVersion: (await ok(admin, `/journey/enrollments/${own.enrollmentId}`)).journeyVersion, status: 'active', reason: 'Ensaio concluído.'}, 'PATCH'); }
  });

  await t.test('troca de mentor, cobertura e autorização do cliente são reavaliadas em cada recurso', async () => {
    await ok(admin, `/enrollments/${own.enrollmentId}/assignments`, {mentorId: mentor2.user.id, kind: 'primary'});
    assert.equal((await request(mentor, `/diagnoses/${diagnosis.id}`)).status, 404);
    assert.ok(!(await ok(mentor, '/diagnoses')).some(value => value.id === diagnosis.id));
    assert.equal((await current(mentor2, diagnosis)).published.version, 2);
    await ok(admin, `/enrollments/${own.enrollmentId}/assignments`, {mentorId: mentor.user.id, kind: 'coverage', endsAt: new Date(Date.now() + 3600e3).toISOString()});
    assert.equal((await request(mentor, `/diagnoses/${diagnosis.id}`)).status, 200);
    await app.db('assignments').where({enrollment_id: own.enrollmentId, mentor_id: mentor.user.id, kind: 'coverage'}).update({starts_at: new Date(Date.now() - 3600e3), ends_at: new Date(Date.now() - 1000)});
    assert.equal((await request(mentor, `/diagnoses/${diagnosis.id}`)).status, 404);
    await ok(admin, `/enrollments/${own.enrollmentId}/assignments`, {mentorId: mentor.user.id, kind: 'primary'});
    await app.db('client_members').where({client_id: own.id, user_id: mentee.user.id}).delete();
    try {
      assert.equal((await request(mentee, `/diagnoses/${diagnosis.id}`)).status, 404);
      assert.equal((await request(mentee, `/plans/${createdPlanId}`)).status, 404);
      assert.ok(!(await ok(mentee, '/diagnoses')).some(value => value.id === diagnosis.id));
    } finally { await app.db('client_members').insert({organization_id: admin.user.organizationId, client_id: own.id, user_id: mentee.user.id}); }
  });

  await t.test('restrições compostas impedem diagnósticos e vínculos entre organizações ou contratações', async () => {
    const source = await app.db('diagnoses').where({id: diagnosis.id}).first();
    await assert.rejects(() => app.db('diagnoses').insert({...source, id: randomUUID(), enrollment_id: foreign.enrollmentId}), error => error.code === '23503');
    const link = await app.db('diagnosis_plan_links').where({diagnosis_id: diagnosis.id}).first();
    await assert.rejects(() => app.db('diagnosis_plan_links').insert({...link, id: randomUUID(), plan_id: secondCyclePlan.id}), error => error.code === '23503');
    const revisions = await app.db('diagnosis_revisions').where({diagnosis_id: diagnosis.id}).orderBy('version');
    assert.equal(revisions[0].snapshot.title, version1.published.title);
    assert.equal(revisions[0].snapshot.findings[0].recommendation, primaryFinding.recommendation);
  });
});

after(() => app.stop());
