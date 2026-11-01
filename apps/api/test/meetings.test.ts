import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateMeetingOutcome, validateMeetingSchedule} from '../src/meetings';

const contract = {starts_at: '2026-10-01T00:00:00Z', ends_at: '2026-12-31T23:59:59Z'};
test('reunião aceita período passado para registrar um encontro histórico dentro da vigência', () => {
  assert.doesNotThrow(() => validateMeetingSchedule('2026-10-02T12:00:00Z', '2026-10-02T13:00:00Z', contract));
});
test('duração inválida e datas fora da vigência não são aceitas', () => {
  assert.throws(() => validateMeetingSchedule('2026-10-02T12:00:00Z', '2026-10-02T12:00:00Z', contract));
  assert.throws(() => validateMeetingSchedule('2026-10-02T12:00:00Z', '2026-10-02T20:00:01Z', contract));
  assert.throws(() => validateMeetingSchedule('2026-09-30T23:59:59Z', '2026-10-01T01:00:00Z', contract));
  assert.throws(() => validateMeetingSchedule('2026-12-31T23:00:00Z', '2027-01-01T00:00:00Z', contract));
});
test('o limite exato de oito horas é permitido', () => {
  assert.doesNotThrow(() => validateMeetingSchedule('2026-10-02T12:00:00Z', '2026-10-02T20:00:00Z', contract));
});
test('realização só pode ser registrada a partir do início', () => {
  const start = '2026-10-30T13:00:00Z', end = '2026-10-30T14:00:00Z';
  assert.throws(() => validateMeetingOutcome('scheduled', 'held', start, end, undefined, new Date('2026-10-30T12:59:59Z')));
  assert.doesNotThrow(() => validateMeetingOutcome('scheduled', 'held', start, end, undefined, new Date(start)));
});
test('ausência exige término do encontro e justificativa', () => {
  const start = '2026-10-30T13:00:00Z', end = '2026-10-30T14:00:00Z';
  assert.throws(() => validateMeetingOutcome('scheduled', 'no_show', start, end, 'Cliente não compareceu', new Date(start)));
  assert.throws(() => validateMeetingOutcome('scheduled', 'no_show', start, end, undefined, new Date(end)));
  assert.doesNotThrow(() => validateMeetingOutcome('scheduled', 'no_show', start, end, 'Cliente não compareceu', new Date(end)));
});
test('estados terminais preservam o resultado; cancelamento exige motivo', () => {
  const start = '2026-10-30T13:00:00Z', end = '2026-10-30T14:00:00Z';
  for (const state of ['held', 'cancelled', 'no_show']) assert.throws(() => validateMeetingOutcome(state, 'held', start, end, undefined, new Date(end)));
  assert.throws(() => validateMeetingOutcome('scheduled', 'cancelled', start, end, undefined, new Date(start)));
});
