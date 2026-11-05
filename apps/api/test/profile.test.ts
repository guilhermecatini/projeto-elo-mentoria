import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {prepareAvatar, profileInput, profileEmailInput, profilePasswordInput, avatarMaxBytes} from '../src/profile-rules';

test('perfil próprio valida dados e recusa papel, vínculos e identificador de outra pessoa', () => {
  const input = {name: ' Ana Ribeiro ', phone: '(11) 99999-0000', expectedVersion: 1};
  assert.equal(profileInput.parse(input).name, 'Ana Ribeiro');
  for (const extra of [{role: 'admin'}, {organizationId: crypto.randomUUID()}, {id: crypto.randomUUID()}, {capacity: 500}]) assert.equal(profileInput.safeParse({...input, ...extra}).success, false);
  assert.equal(profileInput.safeParse({...input, name: '  '}).success, false);
  assert.equal(profileInput.safeParse({...input, phone: 'telefone'}).success, false);
  assert.equal(profileInput.safeParse({...input, expectedVersion: 0}).success, false);
  assert.equal(profileInput.parse({...input, phone: ''}).phone, '');
});

test('e-mail normaliza caixa e senha preserva espaços, confirmação e limite', () => {
  assert.equal(profileEmailInput.parse({email: 'ANA@EXAMPLE.COM', currentPassword: 'senha antiga', expectedVersion: 1}).email, 'ana@example.com');
  const values = {currentPassword: 'AntigaSenha!123', newPassword: '  Nova senha 123  ', confirmPassword: '  Nova senha 123  '};
  assert.equal(profilePasswordInput.parse(values).newPassword, values.newPassword);
  assert.equal(profilePasswordInput.safeParse({...values, confirmPassword: 'diferente1234'}).success, false);
  assert.equal(profilePasswordInput.safeParse({...values, newPassword: values.currentPassword, confirmPassword: values.currentPassword}).success, false);
  assert.equal(profilePasswordInput.safeParse({...values, newPassword: 'a'.repeat(129), confirmPassword: 'a'.repeat(129)}).success, false);
});

test('foto é decodificada, reduzida e regravada sem metadados do original', async () => {
  const original = await sharp({create: {width: 900, height: 600, channels: 3, background: '#315d52'}}).withMetadata({orientation: 6}).jpeg().toBuffer();
  const result = await prepareAvatar({buffer: original, originalname: 'foto.jpg', mimetype: 'image/jpeg', size: original.length});
  const metadata = await sharp(result).metadata();
  assert.equal(metadata.format, 'webp'); assert.equal(metadata.width, 512); assert.equal(metadata.height, 512);
  assert.equal(metadata.exif, undefined); assert.equal(metadata.orientation, undefined); assert.ok(result.length <= 262144);
});

test('foto rejeita SVG, imagem quebrada, disfarce de extensão e arquivo grande', async () => {
  const image = await sharp({create: {width: 20, height: 20, channels: 3, background: '#315d52'}}).png().toBuffer();
  const file = {buffer: image, originalname: 'foto.png', mimetype: 'image/png', size: image.length};
  await assert.rejects(() => prepareAvatar({...file, originalname: 'foto.svg', mimetype: 'image/svg+xml'}));
  await assert.rejects(() => prepareAvatar({...file, originalname: 'foto.jpg', mimetype: 'image/jpeg'}));
  await assert.rejects(() => prepareAvatar({...file, buffer: Buffer.from('89504e470d0a1a0a', 'hex'), size: 8}));
  await assert.rejects(() => prepareAvatar({...file, buffer: Buffer.alloc(avatarMaxBytes + 1), size: avatarMaxBytes + 1}));
  const huge = await sharp({create: {width: 5000, height: 5000, channels: 3, background: '#315d52'}}).png().toBuffer();
  await assert.rejects(() => prepareAvatar({...file, buffer: huge, size: huge.length}));
});
