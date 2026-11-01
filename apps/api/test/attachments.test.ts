import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sanitizeAttachmentName, validateAttachment} from '../src/attachments';

function file(name: string, type: string, content: string | Buffer) {
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
  return {originalname: name, mimetype: type, buffer, size: buffer.length};
}
test('nome de arquivo elimina caminho, controles e preserva extensão', () => {
  assert.equal(sanitizeAttachmentName('../../pasta/a\u0000b.TXT'), 'a_b.txt');
  assert.equal(sanitizeAttachmentName('C:\\privado\\resumo.pdf'), 'resumo.pdf');
  assert.ok(!sanitizeAttachmentName('texto\r\nmalicioso.txt').includes('\n'));
});
test('nome UTF-8 multipart é recuperado sem corromper Unicode já correto', () => {
  const original = 'revisão de preços.txt';
  assert.equal(sanitizeAttachmentName(Buffer.from(original).toString('latin1')), original);
  assert.equal(sanitizeAttachmentName(original), original);
  assert.equal(sanitizeAttachmentName('planejamento 📝.txt'), 'planejamento 📝.txt');
});
test('PDF exige assinatura, extensão e final de documento compatíveis', () => {
  assert.equal(validateAttachment(file('relatorio.pdf', 'application/pdf', '%PDF-1.7\n1 0 obj\nendobj\n%%EOF')).mimeType, 'application/pdf');
  assert.throws(() => validateAttachment(file('relatorio.pdf', 'application/pdf', 'arquivo disfarçado')));
  assert.throws(() => validateAttachment(file('relatorio.exe', 'application/pdf', '%PDF-1.7\n%%EOF')));
});
test('PNG real passa e bytes sem cabeçalho não passam', () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aQioAAAAASUVORK5CYII=', 'base64');
  assert.equal(validateAttachment(file('foto.png', 'image/png', png)).mimeType, 'image/png');
  assert.throws(() => validateAttachment(file('foto.png', 'image/png', Buffer.alloc(80))));
});
test('texto precisa ser UTF-8 legível sem HTML, SVG ou bytes de controle', () => {
  assert.equal(validateAttachment(file('observação.txt', 'text/plain', 'Revisão dos custos.')).mimeType, 'text/plain');
  for (const content of ['<html><script>alert(1)</script></html>', '<svg xmlns="x"></svg>', '\u0000texto', Buffer.from([0xff, 0xfe, 0x00])]) {
    assert.throws(() => validateAttachment(file('observacao.txt', 'text/plain', content)));
  }
});
test('CSV permite MIME de associação do Windows somente com extensão e conteúdo CSV textual', () => {
  assert.equal(validateAttachment(file('dados.csv', 'application/vnd.ms-excel', 'produto;preco\nKit;30')).mimeType, 'text/csv');
  assert.throws(() => validateAttachment(file('dados.xls', 'application/vnd.ms-excel', 'produto;preco\nKit;30')));
});
test('MIME desconhecido genérico não dispensa inspeção do conteúdo', () => {
  assert.equal(validateAttachment(file('dados.txt', 'application/octet-stream', 'Dados válidos')).mimeType, 'text/plain');
  assert.throws(() => validateAttachment(file('foto.png', 'application/octet-stream', '<svg>disfarce</svg>')));
  assert.throws(() => validateAttachment(file('dados.txt', 'image/jpeg', 'Dados válidos')));
});
test('tamanho vazio ou acima de 10 MiB é rejeitado antes de persistir', () => {
  assert.throws(() => validateAttachment(file('vazio.txt', 'text/plain', '')));
  assert.throws(() => validateAttachment(file('grande.txt', 'text/plain', Buffer.alloc(10 * 1024 * 1024 + 1, 97))));
});
