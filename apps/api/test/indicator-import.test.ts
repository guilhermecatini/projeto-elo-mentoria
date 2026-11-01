import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac, randomUUID} from 'node:crypto';
import {classifyIndicatorCsv} from '../src/indicators';
import {
  escapeIndicatorReportCell, indicatorCsvHash, indicatorImportHash, indicatorImportReportCsv,
  issueIndicatorPreview, verifyIndicatorPreview, safeImportFileName, INDICATOR_PREVIEW_TTL_MS,
} from '../src/indicator-import';

const enrollmentId = randomUUID();
const now = new Date('2026-10-31T12:00:00Z');
const baseCsv = 'periodo;situacao;origem;faturamento\r\n2026-08;fechado;Relatório da loja;1000,00';
const binding = {actorId: randomUUID(), organizationId: randomUUID(), enrollmentId, csvHash: indicatorCsvHash(baseCsv)};
const classify = (csv: string, existing: {id: string; period: string; status: string}[] = []) => classifyIndicatorCsv(csv, enrollmentId, existing, now);
function sign(payload: unknown) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = createHmac('sha256', process.env.SESSION_SECRET || 'local-only-development-secret')
    .update('elo:indicator-csv-preview:v1\0').update(encoded).digest('base64url');
  return `${encoded}.${mac}`;
}

test('prévia assinada vincula conteúdo, autor, organização e contratação por trinta minutos', () => {
  const previewHash = indicatorImportHash(classify(baseCsv)); const issued = issueIndicatorPreview(binding, previewHash, now.getTime());
  assert.equal(Date.parse(issued.expiresAt), now.getTime() + INDICATOR_PREVIEW_TTL_MS);
  assert.equal(verifyIndicatorPreview(issued.previewToken, binding, now.getTime()).previewHash, previewHash);
  for (const changed of [{actorId: randomUUID()}, {organizationId: randomUUID()}, {enrollmentId: randomUUID()}, {csvHash: indicatorCsvHash(baseCsv + '\n')}])
    assert.throws(() => verifyIndicatorPreview(issued.previewToken, {...binding, ...changed}, now.getTime()));
});
test('token adulterado, formato excessivo e claims desconhecidas são recusados', () => {
  const issued = issueIndicatorPreview(binding, 'a'.repeat(64), now.getTime());
  const [body, mac] = issued.previewToken.split('.');
  assert.throws(() => verifyIndicatorPreview(`${body}.${mac[0] === 'A' ? 'B' : 'A'}${mac.slice(1)}`, binding, now.getTime()));
  assert.throws(() => verifyIndicatorPreview('a'.repeat(2049), binding, now.getTime()));
  assert.throws(() => verifyIndicatorPreview(issued.previewToken + '=', binding, now.getTime()));
  const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  assert.throws(() => verifyIndicatorPreview(sign({...claims, admin: true}), binding, now.getTime()));
  assert.throws(() => verifyIndicatorPreview(sign({...claims, expiresAt: claims.issuedAt + INDICATOR_PREVIEW_TTL_MS + 1}), binding, now.getTime()));
});
test('expiração exata da prévia exige nova conferência', () => {
  const issued = issueIndicatorPreview(binding, 'b'.repeat(64), now.getTime());
  assert.doesNotThrow(() => verifyIndicatorPreview(issued.previewToken, binding, now.getTime() + INDICATOR_PREVIEW_TTL_MS - 1));
  assert.throws(() => verifyIndicatorPreview(issued.previewToken, binding, now.getTime() + INDICATOR_PREVIEW_TTL_MS),
    (error: any) => error.getStatus() === 409 && error.getResponse().code === 'CSV_PREVIEW_EXPIRED');
});
test('todas as ocorrências de mês repetido ficam inválidas, inclusive se uma falhar na estrutura', () => {
  const duplicate = classify(baseCsv + '\r\n2026-08;fechado;Outra origem;2000,00');
  assert.deepEqual(duplicate.rows.map(row => row.classification), ['invalid', 'invalid']);
  const malformed = classify(baseCsv + '\r\n2026-08;fechado;Outra origem;2000,00;coluna excedente');
  assert.deepEqual(malformed.rows.map(row => row.classification), ['invalid', 'invalid']);
  assert.equal(malformed.counts.create, 0);
});
test('meses existentes são conflitos em qualquer situação e nunca candidatos à sobrescrita', () => {
  for (const status of ['draft', 'published', 'archived']) {
    const existingId = randomUUID(); const preview = classify(baseCsv, [{id: existingId, period: '2026-08', status}]);
    assert.equal(preview.rows[0].classification, 'conflict'); assert.equal(preview.rows[0].existingId, existingId);
  }
});
test('fingerprint considera a classificação relevante, sem invalidar por outro mês', () => {
  const preview = classify(baseCsv); const unrelated = classify(baseCsv, [{id: randomUUID(), period: '2025-01', status: 'published'}]);
  assert.equal(indicatorImportHash(preview), indicatorImportHash(unrelated));
  const changed = classify(baseCsv, [{id: randomUUID(), period: '2026-08', status: 'draft'}]);
  assert.notEqual(indicatorImportHash(preview), indicatorImportHash(changed));
});
test('importação exige algum resultado explícito por linha, permitindo zero', () => {
  assert.equal(classify('periodo;situacao;origem\n2026-08;fechado;Loja').rows[0].classification, 'invalid');
  assert.equal(classify('periodo;situacao;origem;pedidos\n2026-08;fechado;Loja;0').rows[0].classification, 'create');
});
test('erros de validação da prévia têm mensagens em português', () => {
  const preview = classify('periodo;situacao;origem;pedidos\n2026-08;fechado;Loja;1000000001');
  assert.equal(preview.rows[0].classification, 'invalid');
  assert.match(preview.rows[0].errors[0].message, /Use uma quantidade/);
  assert.ok(!preview.rows[0].errors.some(error => /Too big|Invalid input/.test(error.message)));
});
test('relatório CSV neutraliza fórmulas em qualquer célula e traduz campos e situação', () => {
  for (const text of ['=1+1', '+SUM(A1)', '-1+2', '@SUM(A1)', '  =WEBSERVICE("https://example.test")', '\ttexto', '\n=1'])
    assert.ok(escapeIndicatorReportCell(text).startsWith('"\''));
  assert.equal(escapeIndicatorReportCell('nome "seguro"'), '"nome ""seguro"""');
  const csv = indicatorImportReportCsv({counts: {total: 2, imported: 0, skipped: 1, invalid: 1}, duplicatePolicy: 'skip_existing', errors: [],
    rows: [{line: 2, period: '=1+1', status: 'invalid', errors: [{field: 'values.revenue', message: 'Confira o valor.'}]},
      {line: 3, period: '2026-08', status: 'skipped', existingStatus: 'published', errors: []}]});
  assert.ok(csv.startsWith('\uFEFF')); assert.ok(csv.includes('"\'=1+1"')); assert.ok(csv.includes('Faturamento de vendas: Confira o valor.'));
  assert.ok(csv.includes('Publicado')); assert.ok(!csv.includes('values.revenue'));
});
test('nome do arquivo é apenas um rótulo seguro, sem caminhos ou controles', () => {
  assert.equal(safeImportFileName('C:\\temp\\Relatório.csv'), 'Relatório.csv');
  assert.equal(safeImportFileName('../../controle\r\n.csv'), 'controle.csv');
  assert.equal(safeImportFileName(''), null);
});
