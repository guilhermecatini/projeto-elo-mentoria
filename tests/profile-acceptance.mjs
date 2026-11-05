import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import sharp from 'sharp';
import * as argon from 'argon2';
import {integrationEnvironment} from './helpers/integration-environment.mjs';
const {authenticator} = createRequire(import.meta.url)('otplib');
const env = integrationEnvironment({database: 'elo_profilecheck', port: 3347, redisDb: 14});
let users;
const password = () => process.env.DEMO_PASSWORD;
before(async () => { await env.start(); users = await env.accounts(); });
after(() => env.stop());
async function signin(email, secret = password(), otp) {
  const result = await env.request(null, '/auth/login', {email, password: secret, ...(otp ? {otp} : {})});
  assert.equal(result.status, 201, JSON.stringify(result.data));
  return {...result.data, cookie: result.cookie};
}
async function photo(session, file, version, options = {}) {
  const form = new FormData(); form.append('file', new Blob([file], {type: options.mime || 'image/png'}), options.filename || 'perfil.png');
  const response = await fetch(env.origin + '/api/profile/avatar?expectedVersion=' + version, {method: 'POST', headers: {Origin: options.origin || env.origin, Cookie: session.cookie, 'X-CSRF-Token': options.csrf || session.csrfToken}, body: form});
  return {status: response.status, data: await response.json()};
}

test('perfil: próprios dados, privacidade de foto e segurança de credenciais', async t => {
  let mentor = users.mentor, profile;
  await t.test('três perfis consultam somente os próprios dados, sem segredos', async () => {
    for (const user of [users.admin, mentor, users.mentee]) {
      const result = await env.request(user, '/profile'); assert.equal(result.status, 200); assert.equal(result.data.id, user.user.id);
      assert.ok(!JSON.stringify(result.data).includes('password_hash')); assert.ok(!JSON.stringify(result.data).includes('mfa_secret'));
      assert.equal(result.data.avatarUrl, null);
    }
    assert.equal((await env.request(null, '/profile')).status, 401);
    assert.equal((await env.request(mentor, '/profile/' + users.mentee.user.id)).status, 404);
    profile = await env.ok(mentor, '/profile');
  });
  await t.test('nome e telefone persistem; sessão, carteira e papel permanecem corretos', async () => {
    profile = await env.ok(mentor, '/profile', {name: 'Mentor com perfil atualizado', phone: '(11) 99999-1234', expectedVersion: profile.version}, 'PATCH');
    assert.equal(profile.phone, '(11) 99999-1234'); assert.equal(profile.role, 'mentor');
    assert.equal((await env.ok(mentor, '/auth/me')).user.name, profile.name);
    assert.equal((await env.request(mentor, '/profile', {name: 'Invasão', phone: '', expectedVersion: profile.version, role: 'admin'}, 'PATCH')).status, 400);
    assert.equal((await env.request({...mentor, csrfToken: 'incorreto'}, '/profile', {name: 'Teste', phone: '', expectedVersion: profile.version}, 'PATCH')).status, 403);
    assert.equal((await env.request(mentor, '/profile', {name: 'Versão antiga', phone: '', expectedVersion: profile.version - 1}, 'PATCH')).status, 409);
  });
  const image = await sharp({create: {width: 800, height: 650, channels: 3, background: '#315d52'}}).png().toBuffer();
  await t.test('foto exige sessão/CSRF, valida bytes e permite apenas a própria foto', async () => {
    assert.equal((await photo(mentor, image, profile.avatarVersion, {csrf: 'errado'})).status, 403);
    assert.equal((await photo(mentor, image, profile.avatarVersion, {origin: 'https://outro.test'})).status, 403);
    assert.equal((await photo(mentor, Buffer.from('<svg/>'), profile.avatarVersion, {mime: 'image/svg+xml', filename: 'foto.svg'})).status, 400);
    assert.equal((await photo(mentor, Buffer.alloc(2 * 1024 * 1024 + 1), profile.avatarVersion)).status, 413);
    const result = await photo(mentor, image, profile.avatarVersion); assert.equal(result.status, 201); profile = result.data; assert.ok(profile.avatarUrl);
    const response = await fetch(env.origin + profile.avatarUrl, {headers: {Cookie: mentor.cookie}});
    assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), 'image/webp'); assert.match(response.headers.get('cache-control'), /no-store/);
    const data = Buffer.from(await response.arrayBuffer()); const metadata = await sharp(data).metadata(); assert.equal(metadata.width, 512); assert.equal(metadata.height, 512);
    assert.equal((await fetch(env.origin + '/api/profile/avatar', {headers: {Cookie: users.mentee.cookie}})).status, 404);
    assert.equal((await fetch(env.origin + profile.avatarUrl)).status, 401);
    assert.equal((await photo(mentor, image, profile.avatarVersion - 1)).status, 409);
    assert.equal((await env.ok(mentor, '/auth/me')).user.avatarUrl, profile.avatarUrl);
  });
  await t.test('remoção preserva o controle de versão e volta às iniciais', async () => {
    profile = await env.ok(mentor, '/profile/avatar?expectedVersion=' + profile.avatarVersion, undefined, 'DELETE');
    assert.equal(profile.avatarUrl, null);
    assert.equal((await fetch(env.origin + '/api/profile/avatar', {headers: {Cookie: mentor.cookie}})).status, 404);
    assert.equal(await env.db('user_avatars').where({user_id: mentor.user.id}).count('* as n').first().then(row => Number(row.n)), 0);
  });
  await t.test('e-mail exige senha atual e unicidade; troca renova sessão e revoga outras', async () => {
    const otherSession = await signin(mentor.user.email), nextEmail = `atualizado-${randomUUID()}@profile.test`;
    const input = {expectedVersion: profile.version, email: nextEmail, currentPassword: 'senha incorreta'};
    assert.equal((await env.request(mentor, '/profile/email', input)).status, 400);
    assert.equal((await env.request(mentor, '/profile/email', {...input, email: users.admin.user.email, currentPassword: password()})).status, 409);
    const result = await env.request(mentor, '/profile/email', {...input, currentPassword: password()}); assert.equal(result.status, 201); assert.ok(result.cookie); assert.notEqual(result.cookie, mentor.cookie);
    assert.equal((await env.request(mentor, '/auth/me')).status, 401); assert.equal((await env.request(otherSession, '/auth/me')).status, 401);
    const oldEmail = mentor.user.email; mentor = {...result.data, cookie: result.cookie}; profile = result.data.profile;
    assert.equal((await env.ok(mentor, '/auth/me')).user.email, nextEmail);
    assert.equal((await env.request(null, '/auth/login', {email: oldEmail, password: password()})).status, 401);
    assert.equal((await signin(nextEmail)).user.id, mentor.user.id);
  });
  await t.test('senha nova é Argon2id, mantém MFA e invalida acessos e links antigos', async () => {
    const recovery = await env.ok(users.admin, `/users/${mentor.user.id}/recovery`, {});
    const otherSession = await signin(mentor.user.email), nextPassword = '  PerfilNovo!' + randomUUID() + '  ';
    const invalid = {currentPassword: password(), newPassword: 'curta', confirmPassword: 'curta'};
    assert.equal((await env.request(mentor, '/profile/password', invalid)).status, 400);
    assert.equal((await env.request(mentor, '/profile/password', {...invalid, newPassword: nextPassword, confirmPassword: nextPassword + 'x'})).status, 400);
    const result = await env.request(mentor, '/profile/password', {currentPassword: password(), newPassword: nextPassword, confirmPassword: nextPassword}); assert.equal(result.status, 201);
    assert.equal((await env.request(mentor, '/auth/me')).status, 401); assert.equal((await env.request(otherSession, '/auth/me')).status, 401);
    mentor = {...result.data, cookie: result.cookie}; assert.equal((await env.request(mentor, '/auth/me')).status, 200);
    assert.equal((await env.request(null, '/auth/login', {email: mentor.user.email, password: password()})).status, 401);
    assert.equal((await signin(mentor.user.email, nextPassword)).user.id, mentor.user.id);
    const row = await env.db('users').where({id: mentor.user.id}).first(); assert.ok(await argon.verify(row.password_hash, nextPassword)); assert.match(row.password_hash, /^\$argon2id\$/);
    assert.equal((await env.request(null, '/auth/activate', {token: new URL(recovery.activationUrl).searchParams.get('token'), password: nextPassword + 'outro'})).status, 400);
    const audit = await env.db('audit_events').where({entity_id: mentor.user.id}); const serialized = JSON.stringify(audit);
    assert.ok(!serialized.includes(nextPassword)); assert.ok(!serialized.includes(row.password_hash)); assert.ok(!serialized.includes(recovery.activationUrl));
  });
  await t.test('alterações administrativas de nome também invalidam edição antiga do perfil', async () => {
    const original = await env.ok(users.mentee, '/profile');
    await env.ok(users.admin, `/users/${users.mentee.user.id}`, {name: 'Nome ajustado pela administração'}, 'PATCH');
    assert.equal((await env.request(users.mentee, '/profile', {name: original.name, phone: '', expectedVersion: original.version}, 'PATCH')).status, 409);
  });
  await t.test('edições concorrentes não sobrescrevem dados e um login antigo não sobrevive à troca de senha', async () => {
    const current = await env.ok(users.mentee, '/profile');
    const edits = await Promise.all(['Primeira edição', 'Segunda edição'].map(name => env.request(users.mentee, '/profile', {name, phone: '', expectedVersion: current.version}, 'PATCH')));
    assert.deepEqual(edits.map(value => value.status).sort(), [200, 409]);
    const target = users.mentee2, nextPassword = 'Concorrencia!' + randomUUID();
    const [oldLogin, changed] = await Promise.all([
      env.request(null, '/auth/login', {email: target.user.email, password: password()}),
      env.request(target, '/profile/password', {currentPassword: password(), newPassword: nextPassword, confirmPassword: nextPassword}),
    ]);
    assert.equal(changed.status, 201);
    if (oldLogin.status === 201) assert.equal((await env.request({...oldLogin.data, cookie: oldLogin.cookie}, '/auth/me')).status, 401);
    else assert.equal(oldLogin.status, 401);
    assert.equal((await signin(target.user.email, nextPassword)).user.id, target.user.id);
  });
  await t.test('organizações diferentes continuam isoladas e campos de outro usuário são recusados', async () => {
    const foreign = await env.externalOrganization(), own = await env.ok(foreign.admin, '/profile');
    assert.equal(own.id, foreign.admin.user.id); assert.notEqual(own.id, users.admin.user.id);
    assert.equal((await env.request(foreign.admin, '/profile', {name: 'Outro usuário', phone: '', expectedVersion: own.version, id: users.admin.user.id}, 'PATCH')).status, 400);
    assert.equal((await fetch(env.origin + '/api/profile/avatar', {headers: {Cookie: foreign.admin.cookie}})).status, 404);
  });
  await t.test('contas com autenticador exigem seu código ao alterar acesso, sem desativar MFA', async () => {
    const target = users.mentor2, secret = authenticator.generateSecret();
    const recovery = await env.ok(users.admin, `/users/${target.user.id}/recovery`, {});
    const currentRow = await env.db('users').where({id: target.user.id}).first();
    const {createCipheriv, createHash, randomBytes} = await import('node:crypto');
    const iv = randomBytes(12), key = createHash('sha256').update(process.env.SESSION_SECRET || 'local-only-development-secret').digest(), cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = [iv.toString('hex'), cipher.update(secret, 'utf8', 'hex') + cipher.final('hex'), cipher.getAuthTag().toString('hex')].join('.');
    await env.db('users').where({id: target.user.id}).update({mfa_enabled: true, mfa_secret: encrypted});
    const otpSession = await signin(currentRow.email, password(), authenticator.generate(secret)), current = await env.ok(otpSession, '/profile');
    const input = {email: `mfa-${randomUUID()}@profile.test`, expectedVersion: current.version, currentPassword: password()};
    assert.equal((await env.request(otpSession, '/profile/email', input)).status, 400);
    const result = await env.request(otpSession, '/profile/email', {...input, otp: authenticator.generate(secret)}); assert.equal(result.status, 201);
    assert.equal(result.data.profile.mfaEnabled, true); assert.equal((await env.db('users').where({id: target.user.id}).first()).mfa_secret, encrypted);
    assert.equal((await env.request(null, '/auth/activate', {token: new URL(recovery.activationUrl).searchParams.get('token'), password: password()})).status, 400);
  });
});
