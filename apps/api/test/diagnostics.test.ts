import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {
  diagnosticDraftSchema, diagnosticFingerprint, diagnosticFindingSchema,
  validateDiagnosticPublication, validateDiagnosticSize,
} from '../src/diagnostics';

const finding = (overrides: Record<string, unknown> = {}) => diagnosticFindingSchema.parse({
  id: randomUUID(), area: 'catalog', ...overrides,
});
const draft = (overrides: Record<string, unknown> = {}) => diagnosticDraftSchema.parse({
  title: 'Diagnóstico técnico', context: 'Prioridades de catálogo para o ciclo atual.', maturity: 'not_informed',
  findings: [finding({assessment: 'attention', observation: 'Fotos com padrões diferentes.', recommendation: 'Padronizar as fotos.'})],
  ...overrides,
});

test('informação ausente fica não avaliada, sem pontuação ou zero inventado', () => {
  const row = finding();
  assert.equal(row.assessment, 'not_assessed'); assert.equal(row.observation, '');
  assert.equal(row.recommendation, ''); assert.ok(!('score' in row));
});
test('publicação requer contexto e pelo menos uma área avaliada', () => {
  assert.throws(() => validateDiagnosticPublication(draft({context: ''})));
  assert.throws(() => validateDiagnosticPublication(draft({findings: [finding()]})));
});
test('publicação parcial permite áreas ainda não avaliadas', () => {
  const partial = draft(); partial.findings.push(finding({area: 'pricing'}));
  assert.doesNotThrow(() => validateDiagnosticPublication(partial));
});
test('toda avaliação precisa de observação; não aplicável exige justificativa', () => {
  for (const status of ['adequate', 'attention', 'critical', 'not_applicable']) {
    assert.throws(() => validateDiagnosticPublication(draft({findings: [finding({assessment: status})]})));
  }
  assert.doesNotThrow(() => validateDiagnosticPublication(draft({findings: [finding({assessment: 'not_applicable', observation: 'Não há operação própria de estoque neste programa.'})]})));
});
test('hash de publicação não depende da ordem de chaves retornada pelo PostgreSQL', () => {
  const value = draft();
  const reorder = (item: any): any => Array.isArray(item) ? item.map(reorder) : item && typeof item === 'object'
    ? Object.fromEntries(Object.entries(item).reverse().map(([key, value]) => [key, reorder(value)])) : item;
  assert.equal(diagnosticFingerprint(value), diagnosticFingerprint(reorder(value)));
  assert.notEqual(diagnosticFingerprint(value), diagnosticFingerprint({...value, context: 'Outro contexto.'}));
});
test('IDs de achados duplicados e áreas desconhecidas são rejeitados', () => {
  const item = finding();
  assert.throws(() => draft({findings: [item, item]}));
  assert.throws(() => finding({area: 'commercial_diagnosis'}));
});
test('referência de evidência aceita somente HTTPS sem credenciais', () => {
  assert.doesNotThrow(() => finding({evidenceUrl: 'https://example.test/revisao'}));
  for (const url of ['http://example.test', 'javascript:alert(1)', 'https://usuario:senha@example.test/']) {
    assert.throws(() => finding({evidenceUrl: url}));
  }
});
test('limite agregado considera bytes UTF-8 antes de salvar o diagnóstico', () => {
  const value = draft(); assert.doesNotThrow(() => validateDiagnosticSize(value));
  const large = draft({findings: Array.from({length: 8}, () => finding({observation: 'á'.repeat(5000)}))});
  assert.throws(() => validateDiagnosticSize(large));
});
