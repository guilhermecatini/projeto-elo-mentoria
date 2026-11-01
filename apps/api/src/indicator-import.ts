import {ConflictException, ForbiddenException} from '@nestjs/common';
import {createHash, createHmac, timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {METRIC_DEFINITIONS} from './indicator-math';

const DOMAIN = 'elo:indicator-csv-preview:v1\0';
export const INDICATOR_PREVIEW_TTL_MS = 30 * 60 * 1000;
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const claimsSchema = z.object({version: z.literal(1), actorId: z.string().uuid(), organizationId: z.string().uuid(),
  enrollmentId: z.string().uuid(), csvHash: digest, previewHash: digest, issuedAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().positive()}).strict();
export type IndicatorPreviewBinding = Pick<z.infer<typeof claimsSchema>, 'actorId' | 'organizationId' | 'enrollmentId' | 'csvHash'>;

function secret() {
  const value = process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === 'production' && (!value || value.length < 32)) throw new Error('SESSION_SECRET obrigatório.');
  return value || 'local-only-development-secret';
}
function signature(encoded: string) { return createHmac('sha256', secret()).update(DOMAIN).update(encoded).digest(); }
function canonical(value: any): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().filter(key => value[key] !== undefined)
    .map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
export function indicatorImportHash(value: unknown) { return createHash('sha256').update(canonical(value)).digest('hex'); }
export function indicatorCsvHash(csvText: string) { return createHash('sha256').update(csvText, 'utf8').digest('hex'); }
export function issueIndicatorPreview(binding: IndicatorPreviewBinding, previewHash: string, now = Date.now()) {
  const payload = claimsSchema.parse({...binding, previewHash, version: 1, issuedAt: now, expiresAt: now + INDICATOR_PREVIEW_TTL_MS});
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return {previewToken: encoded + '.' + signature(encoded).toString('base64url'), expiresAt: new Date(payload.expiresAt).toISOString()};
}
export function verifyIndicatorPreview(token: string, binding: IndicatorPreviewBinding, now = Date.now()) {
  const invalid = () => new ForbiddenException({code: 'CSV_PREVIEW_INVALID', message: 'A prévia não corresponde a esta importação. Gere uma nova prévia para continuar.'});
  if (typeof token !== 'string' || token.length > 2048 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) throw invalid();
  const [encoded, supplied] = token.split('.'); const actual = Buffer.from(supplied, 'base64url'); const expected = signature(encoded);
  if (actual.length !== expected.length || actual.toString('base64url') !== supplied || !timingSafeEqual(actual, expected)) throw invalid();
  let claims: z.infer<typeof claimsSchema>;
  try { claims = claimsSchema.parse(JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))); } catch { throw invalid(); }
  if (claims.actorId !== binding.actorId || claims.organizationId !== binding.organizationId || claims.enrollmentId !== binding.enrollmentId
    || claims.csvHash !== binding.csvHash || claims.expiresAt <= claims.issuedAt || claims.expiresAt - claims.issuedAt > INDICATOR_PREVIEW_TTL_MS
    || claims.issuedAt > now + 30000) throw invalid();
  if (claims.expiresAt <= now) throw new ConflictException({code: 'CSV_PREVIEW_EXPIRED', message: 'A prévia expirou. Confira o arquivo novamente antes de importar.'});
  return claims;
}

export function safeImportFileName(value?: string) {
  if (!value) return null;
  return value.replaceAll('\\', '/').split('/').at(-1)!.replace(/[\u0000-\u001f\u007f]/g, '').normalize('NFC').trim().slice(0, 150) || null;
}
export function escapeIndicatorReportCell(value: unknown) {
  let text = String(value ?? '');
  // Protect formulas even after leading spaces/control characters; quote every cell and double embedded quotes.
  if (/^[\s\u0000-\u001f\u007f]*[=+@-]/u.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export type IndicatorImportReportRow = {line: number; period?: string; status: 'imported' | 'skipped' | 'invalid';
  indicatorId?: string; existingId?: string; existingStatus?: string; errors: {field: string; message: string}[]};
export type IndicatorImportReport = {counts: {total: number; imported: number; skipped: number; invalid: number};
  rows: IndicatorImportReportRow[]; errors: {field: string; message: string}[]; duplicatePolicy: 'skip_existing'};
function reportField(field: string) {
  const labels: Record<string, string> = {period: 'Período', periodStatus: 'Situação do mês', sourceLabel: 'Origem dos dados', notes: 'Observações',
    basisConfirmed: 'Confirmação da base', adsAttributionConfirmed: 'Confirmação da atribuição', costsComplete: 'Confirmação dos custos',
    row: 'Linha', file: 'Arquivo', header: 'Cabeçalho', enrollmentId: 'Contratação', values: 'Resultados'};
  if (field.startsWith('values.')) return METRIC_DEFINITIONS[field.slice(7) as keyof typeof METRIC_DEFINITIONS]?.label || 'Resultado';
  return labels[field] || 'Campo';
}
export function indicatorImportReportCsv(report: IndicatorImportReport) {
  const labels = {imported: 'Importado como rascunho', skipped: 'Registro existente preservado', invalid: 'Linha inválida'};
  const statuses: Record<string, string> = {draft: 'Rascunho', published: 'Publicado', archived: 'Arquivado'};
  const rows: unknown[][] = [['Linha', 'Período', 'Resultado', 'Indicador criado', 'Indicador existente', 'Situação existente', 'Erros']];
  for (const row of report.rows) rows.push([row.line, row.period, labels[row.status], row.indicatorId, row.existingId, row.existingStatus ? statuses[row.existingStatus] || row.existingStatus : '',
    row.errors.map(error => `${reportField(error.field)}: ${error.message}`).join(' | ')]);
  for (const error of report.errors) rows.push(['', '', 'Erro do arquivo', '', '', '', `${reportField(error.field)}: ${error.message}`]);
  return '\uFEFF' + rows.map(row => row.map(escapeIndicatorReportCell).join(';')).join('\r\n') + '\r\n';
}
