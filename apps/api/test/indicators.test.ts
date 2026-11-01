import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {
  createIndicatorSchema, indicatorDataSchema, indicatorFingerprint, indicatorValuesSchema,
  currentIndicatorMonth, normalizeIndicatorGoal, validateIndicatorPeriod, validateIndicatorPublication,
} from '../src/indicators';

const data = (overrides: Record<string, unknown> = {}) => indicatorDataSchema.parse({
  periodStatus: 'closed', sourceLabel: 'Relatório da loja', values: {}, ...overrides,
});
test('indicadores omitidos permanecem null e zero informado permanece zero', () => {
  const value = data({values: {revenue: '0', orders: 0}});
  assert.equal(value.values.revenue, '0.00'); assert.equal(value.values.orders, 0);
  assert.equal(value.values.visits, null); assert.equal(value.values.totalCosts, null);
  assert.equal(value.basisConfirmed, false);
});
test('dinheiro preserva decimal canônico e rejeita número, expoente, negativo e excedente', () => {
  assert.equal(data({values: {revenue: '999999999999.99'}}).values.revenue, '999999999999.99');
  assert.equal(data({values: {revenue: '1000000000000'}}).values.revenue, '1000000000000.00');
  for (const revenue of [1.2, '', '1e3', '-1.00', '1,20', '1.001', '1000000000000.01'])
    assert.throws(() => data({values: {revenue}}));
  for (const orders of [-1, 1.5, 1000000001, '3']) assert.throws(() => data({values: {orders}}));
});
test('estoque e catálogo validam subconjuntos somente quando os totais estão informados', () => {
  assert.doesNotThrow(() => indicatorValuesSchema.parse({outOfStockSkus: 3}));
  assert.throws(() => indicatorValuesSchema.parse({skuCount: 2, outOfStockSkus: 3}));
  assert.throws(() => indicatorValuesSchema.parse({activeListings: 3, completeListings: 4}));
});
test('confirmação de custos exige dado explícito, inclusive zero', () => {
  assert.throws(() => data({costsComplete: true}));
  assert.doesNotThrow(() => data({costsComplete: true, values: {totalCosts: '0.00'}}));
});
test('fechamento mensal considera virada do mês em São Paulo', () => {
  const before = new Date('2026-11-01T02:59:59Z'); const after = new Date('2026-11-01T03:00:00Z');
  assert.equal(currentIndicatorMonth(before), '2026-10'); assert.equal(currentIndicatorMonth(after), '2026-11');
  assert.throws(() => validateIndicatorPeriod('2026-10', 'closed', before));
  assert.doesNotThrow(() => validateIndicatorPeriod('2026-10', 'closed', after));
  assert.throws(() => validateIndicatorPeriod('2026-12', 'partial', after));
  assert.doesNotThrow(() => validateIndicatorPeriod('2020-01', 'closed', after));
});
test('publicação exige algum resultado, mas zero real é permitido', () => {
  assert.throws(() => validateIndicatorPublication(data()));
  assert.doesNotThrow(() => validateIndicatorPublication(data({values: {claims: 0}})));
});
test('cliente não pode declarar fonte sincronizada ou atributos desconhecidos', () => {
  const input = {enrollmentId: randomUUID(), period: '2026-09', ...data()};
  assert.doesNotThrow(() => createIndicatorSchema.parse(input));
  for (const sourceType of ['manual', 'csv', 'sync']) assert.throws(() => createIndicatorSchema.parse({...input, sourceType}));
});
test('hash de publicação ignora ordem JSON e preserva diferenças de conteúdo', () => {
  const value = data({values: {revenue: '12.50'}});
  const reordered = {...value, values: Object.fromEntries(Object.entries(value.values).reverse())};
  assert.equal(indicatorFingerprint(value), indicatorFingerprint(reordered as typeof value));
  assert.notEqual(indicatorFingerprint(value), indicatorFingerprint({...value, notes: 'Correção'}));
});
test('metas aceitam zero, preservam quatro casas e limitam unidade sem teto percentual artificial', () => {
  assert.equal(normalizeIndicatorGoal('revenue', '0'), '0.00');
  assert.equal(normalizeIndicatorGoal('roas', '3.1234'), '3.1234');
  assert.equal(normalizeIndicatorGoal('estimatedMargin', '-25.1234'), '-25.1234');
  assert.equal(normalizeIndicatorGoal('conversionRate', '150'), '150.0000');
  assert.equal(normalizeIndicatorGoal('estimatedMargin', '999999999999.9999'), '999999999999.9999');
  for (const [metric, value] of [['orders', '1.5'], ['revenue', '1.123'], ['roas', '-1'], ['estimatedMargin', '1000000000000.0001']] as const)
    assert.throws(() => normalizeIndicatorGoal(metric, value));
});
