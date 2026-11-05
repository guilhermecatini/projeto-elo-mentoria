import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {integrationEnvironment} from './helpers/integration-environment.mjs';

const env = integrationEnvironment({database: 'elo_avatarscheck', port: 3348, redisDb: 15});
let users, client, ticket, image, mentorPhoto;
before(async () => {
  await env.start(); users = await env.accounts();
  const [program] = await env.ok(users.admin, '/programs');
  client = await env.client(users.admin, program.id, users.mentor.user.id, users.mentee.user.id, 'Avatares');
  ticket = await env.ok(users.mentee, '/tickets', {enrollmentId: client.enrollmentId, subject: 'Fotos nas mensagens', description: 'Minha primeira mensagem'});
  image = await sharp({create: {width: 512, height: 512, channels: 3, background: '#527e3b'}}).webp().toBuffer();
  for (const user of [users.mentor, users.mentee, users.admin, users.mentor2]) await upload(user);
});
after(() => env.stop());
async function upload(user) {
  const profile = await env.ok(user, '/profile');
  const form = new FormData(); form.append('file', new Blob([image], {type: 'image/webp'}), 'perfil.webp');
  const response = await fetch(env.origin + '/api/profile/avatar?expectedVersion=' + profile.avatarVersion, {method: 'POST', headers: {Origin: env.origin, Cookie: user.cookie, 'X-CSRF-Token': user.csrfToken}, body: form});
  assert.equal(response.status, 201); return response.json();
}
async function fetchPhoto(user, url) {
  assert.ok(url, 'A identidade deve conter a URL da foto');
  return fetch(env.origin + url, {headers: user ? {Cookie: user.cookie} : {}});
}
async function visiblePhoto(user, url) {
  const response = await fetchPhoto(user, url); assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control'), /private, no-store/);
  assert.equal(response.headers.get('content-type'), 'image/webp');
  assert.deepEqual(await sharp(Buffer.from(await response.arrayBuffer())).metadata().then(m => [m.width, m.height]), [512, 512]);
}

test('fotos acompanham identidades autorizadas e respeitam mudanças de acesso', async t => {
  await t.test('mensagens públicas mostram a foto do autor; notas internas continuam privadas', async () => {
    await env.ok(users.mentor, `/tickets/${ticket.id}/messages`, {body: 'Resposta com foto', kind: 'public'});
    await env.ok(users.admin, `/tickets/${ticket.id}/messages`, {body: 'Análise interna com foto', kind: 'internal'});
    const conversation = await env.ok(users.mentee, `/tickets/${ticket.id}`);
    assert.equal(conversation.messages.some(m => m.kind === 'internal'), false);
    const message = conversation.messages.find(m => m.authorId === users.mentor.user.id);
    mentorPhoto = message.authorAvatarUrl; await visiblePhoto(users.mentee, mentorPhoto);
    await visiblePhoto(users.mentee, conversation.messages.find(m => m.authorId === users.mentee.user.id).authorAvatarUrl);
    const staff = await env.ok(users.mentor, `/tickets/${ticket.id}`);
    await visiblePhoto(users.mentor, staff.messages.find(m => m.kind === 'internal').authorAvatarUrl);
    assert.ok(!JSON.stringify(conversation).includes('Análise interna'));
  });
  await t.test('URLs exigem sessão, destinatário e assinatura; UUIDs de pessoas não concedem acesso', async () => {
    assert.equal((await fetchPhoto(null, mentorPhoto)).status, 401);
    assert.equal((await fetchPhoto(users.mentee2, mentorPhoto)).status, 404);
    assert.equal((await fetchPhoto(users.admin, mentorPhoto)).status, 404);
    const tampered = new URL(mentorPhoto, env.origin); tampered.searchParams.set('contextId', randomUUID());
    assert.equal((await fetchPhoto(users.mentee, tampered.pathname + tampered.search)).status, 404);
    assert.equal((await fetchPhoto(users.mentee, mentorPhoto.replace(users.mentor.user.id, users.mentor2.user.id))).status, 404);
    assert.equal((await fetch(env.origin + `/api/people/${users.mentor2.user.id}/avatar`, {headers: {Cookie: users.mentee.cookie}})).status, 400);
    const other = await env.externalOrganization();
    assert.equal((await fetchPhoto(other.admin, mentorPhoto)).status, 404);
    assert.equal((await env.request(users.mentee2, `/tickets/${ticket.id}`)).status, 404);
  });
  await t.test('carteira, diretório e administração usam fotos sem transformá-las em fotos de empresas', async () => {
    const portfolio = await env.ok(users.mentee, '/clients');
    const row = portfolio.find(c => c.enrollmentId === client.enrollmentId);
    await visiblePhoto(users.mentee, row.mentorAvatarUrl); assert.equal(row.avatarUrl, undefined);
    const directory = await env.ok(users.mentor, '/mentors');
    await visiblePhoto(users.mentor, directory.find(p => p.id === users.mentor.user.id).avatarUrl);
    const managed = await env.ok(users.admin, '/users');
    await visiblePhoto(users.admin, managed.find(p => p.id === users.mentee.user.id).avatarUrl);
    const journey = await env.ok(users.mentee, `/journey/enrollments/${client.enrollmentId}`);
    await visiblePhoto(users.mentee, journey.mentorAvatarUrl);
    const timeline = await env.ok(users.mentee, `/journey/enrollments/${client.enrollmentId}/timeline`);
    await visiblePhoto(users.mentee, timeline.find(event => event.authorId === users.mentor.user.id).authorAvatarUrl);
  });
  await t.test('tarefas, responsáveis, participantes e históricos recebem a mesma foto da pessoa', async () => {
    const plan = await env.ok(users.mentor, '/plans', {enrollmentId: client.enrollmentId, title: 'Plano com pessoas', objective: 'Identificar responsáveis'});
    const task = await env.ok(users.mentor, `/plans/${plan.id}/tasks`, {title: 'Conferir fotos', assigneeId: users.mentee.user.id, dueAt: new Date(Date.now() + 86400000).toISOString(), completionCriteria: 'Fotos visíveis'});
    const detail = await env.ok(users.mentor, `/tasks/${task.id}`);
    await visiblePhoto(users.mentor, detail.assigneeAvatarUrl);
    await visiblePhoto(users.mentor, detail.history.find(h => h.actorId === users.mentor.user.id).actorAvatarUrl);
    const assignees = await env.ok(users.mentor, `/enrollments/${client.enrollmentId}/task-assignees`);
    await visiblePhoto(users.mentor, assignees.find(p => p.id === users.mentee.user.id).avatarUrl);
    const meeting = await env.ok(users.mentor, '/meetings', {enrollmentId: client.enrollmentId, title: 'Reunião com fotos', hostId: users.mentor.user.id, participantIds: [users.mentor.user.id, users.mentee.user.id], startsAt: new Date(Date.now() + 3600000).toISOString(), endsAt: new Date(Date.now() + 7200000).toISOString()});
    const meetingDetail = await env.ok(users.mentee, `/meetings/${meeting.id}`);
    await visiblePhoto(users.mentee, meetingDetail.hostAvatarUrl);
    await visiblePhoto(users.mentee, meetingDetail.participants.find(p => p.userId === users.mentor.user.id).avatarUrl);
    assert.equal(meetingDetail.history, undefined);
  });
  await t.test('avaliações deixam de conceder foto quando o autor retira o compartilhamento', async () => {
    const cycle = await env.ok(users.admin, `/journey/enrollments/${client.enrollmentId}`);
    await env.ok(users.admin, `/journey/enrollments/${client.enrollmentId}`, {expectedVersion: cycle.journeyVersion, stage: 'review', reason: 'Revisão para avaliação'}, 'PATCH');
    const response = await env.ok(users.mentee, '/journey/satisfaction', {enrollmentId: client.enrollmentId, contextType: 'cycle', contextId: client.enrollmentId, score: 5, comment: 'Ótimo', sharedWithMentor: true});
    const stats = await env.ok(users.mentor, '/journey/satisfaction');
    const avatar = stats.responses.find(r => r.id === response.id).respondentAvatarUrl;
    await visiblePhoto(users.mentor, avatar);
    await env.ok(users.mentee, `/journey/satisfaction/${response.id}`, {expectedVersion: 1, score: 5, comment: 'Ótimo', sharedWithMentor: false, reason: 'Manter privado'}, 'PATCH');
    assert.equal((await fetchPhoto(users.mentor, avatar)).status, 404);
  });
  await t.test('histórico de material revalida a visibilidade e não interpreta dados de auditoria como pessoas', async () => {
    const material = await env.ok(users.admin, '/materials', {title: 'Material reservado à equipe', visibility: 'team', enrollmentId: client.enrollmentId});
    await env.db('audit_events').insert({id: randomUUID(), organization_id: users.admin.user.organizationId, actor_id: users.admin.user.id, entity_type: 'material', entity_id: material.id, action: 'Validação de identidade', details: JSON.stringify({authorId: users.mentor2.user.id, authorName: 'Nome fornecido em texto', participants: [{id: users.mentor2.user.id, name: 'Nome fornecido em texto'}]})});
    const detail = await env.ok(users.mentor, `/materials/${material.id}`);
    const event = detail.history.find(h => h.action === 'Validação de identidade');
    await visiblePhoto(users.mentor, event.actorAvatarUrl);
    assert.equal(event.details.authorAvatarUrl, undefined); assert.equal(event.details.participants[0].avatarUrl, undefined);
    await env.db('documents').where({id: material.id}).update({visibility: 'admin_private'});
    assert.equal((await fetchPhoto(users.mentor, event.actorAvatarUrl)).status, 404);
  });
  await t.test('trocar a foto invalida a versão anterior, e removê-la devolve o fallback', async () => {
    const before = mentorPhoto;
    const profile = await upload(users.mentor);
    assert.equal((await fetchPhoto(users.mentee, before)).status, 404);
    const detail = await env.ok(users.mentee, `/tickets/${ticket.id}`);
    mentorPhoto = detail.messages.find(m => m.authorId === users.mentor.user.id).authorAvatarUrl;
    await visiblePhoto(users.mentee, mentorPhoto);
    await env.ok(users.mentor, `/profile/avatar?expectedVersion=${profile.avatarVersion}`, undefined, 'DELETE');
    assert.equal((await fetchPhoto(users.mentee, mentorPhoto)).status, 404);
    assert.equal((await env.ok(users.mentee, `/tickets/${ticket.id}`)).messages.find(m => m.authorId === users.mentor.user.id).authorAvatarUrl, null);
    await upload(users.mentor);
  });
  await t.test('fotos de uma carteira deixam de abrir após a transferência do atendimento', async () => {
    const detail = await env.ok(users.mentor, `/tickets/${ticket.id}`);
    const memberPhoto = detail.messages.find(m => m.authorId === users.mentee.user.id).authorAvatarUrl;
    await visiblePhoto(users.mentor, memberPhoto);
    await env.ok(users.admin, `/enrollments/${client.enrollmentId}/assignments`, {mentorId: users.mentor2.user.id, kind: 'primary'});
    assert.equal((await fetchPhoto(users.mentor, memberPhoto)).status, 404);
    assert.equal((await env.request(users.mentor, `/tickets/${ticket.id}`)).status, 404);
    const transferred = await env.ok(users.mentor2, `/tickets/${ticket.id}`);
    await visiblePhoto(users.mentor2, transferred.messages.find(m => m.authorId === users.mentee.user.id).authorAvatarUrl);
  });
});
