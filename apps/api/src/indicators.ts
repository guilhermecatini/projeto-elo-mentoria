import {
  BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get,
  Inject, Injectable, Module, NotFoundException, Param, Patch, Post, Query, Req, Res,
} from '@nestjs/common';
import {createHash, randomUUID} from 'node:crypto';
import type {Knex} from 'knex';
import {z} from 'zod';
import {db} from './db';
import {User} from './auth';
import {audit, enrollment, scopedEnrollments} from './access';
import {
  INDICATOR_KEYS, METRIC_DEFINITIONS, computeIndicatorMetrics, compareIndicatorPeriods, evaluateIndicatorGoal,
  indicatorMonths, previousIndicatorMonth, type IndicatorData,
} from './indicator-math';
import {indicatorCsvTemplate, parseIndicatorCsv} from './indicator-csv';
import {reportCsv} from './report-math';
import {
  indicatorCsvHash, indicatorImportHash, indicatorImportReportCsv, issueIndicatorPreview, safeImportFileName,
  verifyIndicatorPreview, type IndicatorImportReport, type IndicatorImportReportRow,
} from './indicator-import';

type Connection = Knex | Knex.Transaction;
const uuid = z.string().uuid();
const expectedVersion = z.number().int().positive();
export const indicatorPeriodSchema = z.string().regex(/^[1-9][0-9]{3}-(0[1-9]|1[0-2])$/, 'Use um mês no formato AAAA-MM.');
const evolutionQuery = z.object({enrollmentId: uuid, from: indicatorPeriodSchema, to: indicatorPeriodSchema}).strict();
const notes = z.string().trim().max(10000);
const reason = z.string().trim().min(1).max(2000);
function decimalUnits(value: string, places: number) {
  const [whole, fraction = ''] = value.replace(/^-/, '').split('.');
  return BigInt(whole) * (10n ** BigInt(places)) + BigInt(fraction.padEnd(places, '0'));
}
const decimal = z.string().trim().regex(/^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$/, 'Informe um valor decimal positivo com até duas casas.')
  .refine(value => /^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$/.test(value) && decimalUnits(value, 2) <= 100000000000000n,
    'O valor excede o limite permitido.').transform(value => { const [whole, fraction = ''] = value.split('.'); return `${whole}.${fraction.padEnd(2, '0')}`; });
const money = decimal.nullable().default(null);
const count = z.number().int().min(0).max(1e9).nullable().default(null);
export const indicatorValuesSchema = z.object({
  revenue: money, orders: count, visits: count, adSpend: money, attributedRevenue: money, totalCosts: money,
  claims: count, cancellations: count, lateShipments: count, skuCount: count, outOfStockSkus: count,
  activeListings: count, completeListings: count,
}).strict().superRefine((value, context) => {
  if (value.skuCount !== null && value.outOfStockSkus !== null && value.outOfStockSkus > value.skuCount)
    context.addIssue({code: 'custom', path: ['outOfStockSkus'], message: 'Itens sem estoque não podem superar o total de itens.'});
  if (value.activeListings !== null && value.completeListings !== null && value.completeListings > value.activeListings)
    context.addIssue({code: 'custom', path: ['completeListings'], message: 'Anúncios completos não podem superar os anúncios ativos.'});
});
const dataFields = {
  periodStatus: z.enum(['partial', 'closed']), sourceLabel: z.string().trim().min(1).max(200), notes: notes.default(''),
  basisConfirmed: z.boolean().default(false), adsAttributionConfirmed: z.boolean().default(false),
  costsComplete: z.boolean().default(false), values: indicatorValuesSchema,
};
export const indicatorDataSchema = z.object(dataFields).strict().superRefine((value, context) => {
  if (value.costsComplete && value.values.totalCosts === null)
    context.addIssue({code: 'custom', path: ['values', 'totalCosts'], message: 'Informe os custos totais antes de confirmar que estão completos.'});
});
export const createIndicatorSchema = z.object({enrollmentId: uuid, period: indicatorPeriodSchema, ...dataFields}).strict();
const saveInput = z.object({expectedVersion, reason: reason.optional(), ...dataFields}).strict();
const csvImportInput = z.object({enrollmentId: uuid, csvText: z.string().min(1).max(65536),
  previewToken: z.string().min(1).max(2048), requestKey: uuid, confirmed: z.literal(true),
  duplicatePolicy: z.literal('skip_existing'), fileName: z.string().trim().max(150).optional()}).strict();
const metricKey = z.enum(['revenue', 'orders', 'visits', 'adSpend', 'attributedRevenue', 'totalCosts', 'claims',
  'cancellations', 'lateShipments', 'skuCount', 'outOfStockSkus', 'activeListings', 'completeListings',
  'averageTicket', 'conversionRate', 'roas', 'acos', 'tacos', 'estimatedMargin']);
const target = z.string().trim().regex(/^-?(0|[1-9][0-9]*)(\.[0-9]{1,4})?$/, 'Informe um número decimal com até quatro casas.')
  .refine(value => /^-?(0|[1-9][0-9]*)(\.[0-9]{1,4})?$/.test(value) && decimalUnits(value, 4) <= 10000000000000000n,
    'A meta excede o limite permitido.');
const goalFields = {period: indicatorPeriodSchema, metricKey, target, direction: z.enum(['at_least', 'at_most']),
  planId: uuid.nullable().optional(), notes: notes.default('')};
const createGoalInput = z.object({enrollmentId: uuid, ...goalFields}).strict();
const patchGoalInput = z.object({expectedVersion, reason, period: indicatorPeriodSchema.optional(), metricKey: metricKey.optional(),
  target: target.optional(), direction: z.enum(['at_least', 'at_most']).optional(), planId: uuid.nullable().optional(), notes: notes.optional()}).strict()
  .refine(value => Object.keys(value).some(key => !['expectedVersion', 'reason'].includes(key)), 'Informe uma alteração.');

function staff(user: User) { if (user.role === 'mentee') throw new ForbiddenException('A equipe de mentoria registra os indicadores e as metas.'); }
function mutable(row: any) { if (row.status === 'archived') throw new BadRequestException('Reative este registro com uma justificativa antes de alterá-lo.'); }
function checkVersion(row: any, expected: number, field = 'draft_version') {
  if (row[field] !== expected) throw new ConflictException('Outra pessoa atualizou este conteúdo. Recarregue a versão atual antes de salvar.');
}
function canonical(value: any): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().filter(key => value[key] !== undefined)
    .map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
export function indicatorFingerprint(data: IndicatorData) { return createHash('sha256').update(canonical(data)).digest('hex'); }
export function currentIndicatorMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit'}).formatToParts(now);
  return `${parts.find(part => part.type === 'year')!.value}-${parts.find(part => part.type === 'month')!.value}`;
}
export function validateIndicatorPeriod(period: string, status: 'partial' | 'closed', now = new Date()) {
  indicatorPeriodSchema.parse(period); const current = currentIndicatorMonth(now);
  if (period > current) throw new BadRequestException('Os resultados não podem pertencer a um mês futuro.');
  if (status === 'closed' && period >= current) throw new BadRequestException('O mês atual ainda está em andamento. Registre os resultados como parciais.');
}
export function validateIndicatorPublication(data: IndicatorData) {
  if (!Object.values(data.values).some(value => value !== null)) throw new BadRequestException('Informe pelo menos um resultado antes de publicar.');
}
export function normalizeIndicatorGoal(metric: z.infer<typeof metricKey>, value: string) {
  const parsed = target.parse(value); const number = Number(parsed); const definition = METRIC_DEFINITIONS[metric];
  if (number < 0 && metric !== 'estimatedMargin') throw new BadRequestException('Apenas a margem estimada aceita uma meta negativa.');
  const places = parsed.split('.')[1]?.length || 0;
  if (definition.unit === 'count' && places > 0) throw new BadRequestException('Use um número inteiro para esta meta.');
  if (definition.unit === 'BRL' && places > 2) throw new BadRequestException('Use no máximo duas casas decimais para uma meta em reais.');
  const [whole, fraction = ''] = parsed.replace(/^-/, '').split('.');
  const sign = number < 0 ? '-' : ''; const precision = definition.unit === 'BRL' ? 2 : 4;
  return definition.unit === 'count' ? whole : `${sign}${whole}.${fraction.padEnd(precision, '0')}`;
}
function publishedDto(row: any) {
  return row ? {...row.snapshot, version: row.version, publishedAt: row.published_at, metrics: computeIndicatorMetrics(row.snapshot)} : null;
}
function csvValidationIssue(issue: any) {
  let message = issue.message;
  if (/^(Invalid|Too (big|small)|Unrecognized)/.test(message)) {
    if (issue.code === 'too_big') message = issue.origin === 'string'
      ? `Use até ${issue.maximum} caracteres neste campo.` : `Use uma quantidade de até ${issue.maximum}.`;
    else if (issue.code === 'too_small') message = issue.origin === 'string'
      ? 'Preencha este campo.' : `Use um valor de pelo menos ${issue.minimum}.`;
    else if (issue.code === 'invalid_type') message = 'Informe um valor no formato indicado para este campo.';
    else message = 'Confira o formato e o conteúdo deste campo.';
  }
  return {field: issue.path.join('.'), message};
}
export function classifyIndicatorCsv(csvText: string, enrollmentId: string,
  existing: {id: string; period: string; status: string}[], now = new Date()) {
  const parsed = parseIndicatorCsv(csvText); const frequencies = new Map<string, number>();
  for (const row of parsed.rows) {
    const period = row.data?.period || row.period;
    if (period) frequencies.set(period, (frequencies.get(period) || 0) + 1);
  }
  const rows = parsed.rows.map(row => {
    const errors = [...row.errors]; let data: any = row.data;
    if (!errors.length && data) {
      const validated = createIndicatorSchema.safeParse({enrollmentId, ...data});
      if (!validated.success) errors.push(...validated.error.issues.map(csvValidationIssue));
      else {
        try {
          const {enrollmentId: _, period, ...raw} = validated.data; const clean = indicatorDataSchema.parse(raw);
          validateIndicatorPeriod(period, clean.periodStatus, now); validateIndicatorPublication(clean); data = {period, ...clean};
        } catch (error) {
          if (error instanceof z.ZodError) errors.push(...error.issues.map(csvValidationIssue));
          else errors.push({field: 'row', message: error instanceof Error ? error.message : 'Confira os dados da linha.'});
        }
      }
    }
    const period = data?.period || row.period; const record = existing.find(item => item.period === period);
    if (period && (frequencies.get(period) || 0) > 1)
      errors.push({field: 'period', message: 'O mesmo mês aparece mais de uma vez no arquivo. Nenhuma dessas linhas será importada.'});
    return {...row, data, errors, classification: errors.length || !data ? 'invalid' as const : record ? 'conflict' as const : 'create' as const,
      ...(record ? {existingId: record.id, existingStatus: record.status} : {})};
  });
  return {...parsed, rows, counts: {create: rows.filter(row => row.classification === 'create').length,
    conflict: rows.filter(row => row.classification === 'conflict').length, invalid: rows.filter(row => row.classification === 'invalid').length}};
}
function importDto(row: any, detail = false) {
  return {id: row.id, enrollmentId: row.enrollment_id, clientName: row.client_name, createdAt: row.created_at,
    createdById: row.created_by, createdByName: row.created_by_name, fileName: row.file_name,
    counts: row.report.counts, ...(detail ? {rows: row.report.rows, errors: row.report.errors, duplicatePolicy: row.duplicate_policy} : {})};
}

@Injectable()
export class IndicatorsService {
  private scoped(user: User, table = 'indicators', connection: Connection = db) {
    const query = connection(`${table} as i`).join('enrollments as e', 'e.id', 'i.enrollment_id')
      .join('clients as c', 'c.id', 'e.client_id').where('i.organization_id', user.organizationId)
      .whereIn('i.enrollment_id', scopedEnrollments(user, connection).select('e.id'));
    if (table === 'indicators' && user.role === 'mentee') query.where('i.published_version', '>', 0);
    return query;
  }
  private async row(user: User, id: string, connection: Connection = db) {
    const row = await this.scoped(user, 'indicators', connection).where('i.id', id)
      .select('i.*', 'e.status as enrollmentStatus', 'c.id as clientId', 'c.name as clientName').first();
    if (!row) throw new NotFoundException('Indicador mensal não encontrado.'); return row;
  }
  private async lockEnrollment(user: User, id: string, trx: Knex.Transaction) {
    await enrollment(user, id, trx);
    await trx('enrollments').where({id, organization_id: user.organizationId}).forUpdate().first();
    const e = await enrollment(user, id, trx);
    if (e.status !== 'active') throw new BadRequestException('A contratação precisa estar ativa para registrar indicadores e metas.');
    return e;
  }
  private async lockIndicator(user: User, id: string, trx: Knex.Transaction) {
    const current = await this.row(user, id, trx); await this.lockEnrollment(user, current.enrollment_id, trx);
    return trx('indicators').where({id, organization_id: user.organizationId}).forUpdate().first();
  }
  private async plan(user: User, enrollmentId: string, id: string | null | undefined, trx: Knex.Transaction) {
    if (!id) return;
    const row = await trx('action_plans').where({id, organization_id: user.organizationId, enrollment_id: enrollmentId}).forUpdate().first();
    if (!row || row.status !== 'active') throw new BadRequestException('Selecione um plano ativo da mesma contratação.');
  }
  private async revisions(user: User, ids: string[], connection: Connection = db) {
    return connection('indicator_revisions').where({organization_id: user.organizationId}).whereIn('indicator_id', ids).orderBy('version', 'desc');
  }
  async list(user: User, filters: {enrollmentId?: string; status?: string; from?: string; to?: string} = {}) {
    let query = this.scoped(user).select('i.*', 'e.status as enrollmentStatus', 'c.id as clientId', 'c.name as clientName').orderBy('i.period', 'desc');
    if (filters.enrollmentId) query = query.where('i.enrollment_id', filters.enrollmentId);
    if (filters.status) query = query.where('i.status', filters.status);
    if (filters.from) query = query.where('i.period', '>=', filters.from);
    if (filters.to) query = query.where('i.period', '<=', filters.to);
    const rows = await query; if (!rows.length) return [];
    const revisions = await this.revisions(user, rows.map(row => row.id));
    return rows.map(row => {
      const published = revisions.find(revision => revision.indicator_id === row.id && revision.version === row.published_version);
      const visible = published?.snapshot || row.draft;
      return {id: row.id, enrollmentId: row.enrollment_id, enrollmentStatus: row.enrollmentStatus, clientId: row.clientId,
        clientName: row.clientName, period: row.period, status: row.status, sourceType: row.source_type,
        sourceLabel: visible.sourceLabel, periodStatus: visible.periodStatus, publishedVersion: row.published_version || null,
        publishedAt: published?.published_at || null, metrics: published ? computeIndicatorMetrics(published.snapshot) : null,
        createdAt: row.created_at, ...(user.role !== 'mentee' ? {draftVersion: row.draft_version, updatedAt: row.updated_at,
          hasUnpublishedChanges: !published || published.snapshot_hash !== indicatorFingerprint(row.draft)} : {})};
    });
  }
  async detail(user: User, id: string, version?: number) {
    const row = await this.row(user, id); const revisions = await this.revisions(user, [id]);
    const selected = version ? revisions.find(revision => revision.version === version) : revisions[0];
    if (version && !selected) throw new NotFoundException('Versão publicada não encontrada.');
    const result: Record<string, unknown> = {id: row.id, enrollmentId: row.enrollment_id, enrollmentStatus: row.enrollmentStatus,
      clientId: row.clientId, clientName: row.clientName, period: row.period, status: row.status, sourceType: row.source_type,
      publishedVersion: row.published_version || null, published: publishedDto(selected),
      revisions: revisions.map(revision => ({version: revision.version, publishedAt: revision.published_at})), createdAt: row.created_at};
    if (user.role !== 'mentee') {
      result.draftVersion = row.draft_version; result.draft = row.draft; result.updatedAt = row.updated_at;
      result.hasUnpublishedChanges = !revisions[0] || revisions[0].snapshot_hash !== indicatorFingerprint(row.draft);
      result.history = await db('audit_events as a').leftJoin('users as u', 'u.id', 'a.actor_id')
        .where({'a.organization_id': user.organizationId, 'a.entity_type': 'indicator', 'a.entity_id': id})
        .select('a.id', 'a.action', 'a.details', 'a.created_at as createdAt', 'u.name as actorName').orderBy('a.created_at', 'desc').limit(200);
    }
    return result;
  }
  async create(user: User, input: z.infer<typeof createIndicatorSchema>) {
    staff(user); const {enrollmentId, period, ...raw} = input; const data = indicatorDataSchema.parse(raw);
    validateIndicatorPeriod(period, data.periodStatus);
    return db.transaction(async trx => {
      await this.lockEnrollment(user, enrollmentId, trx);
      const existing = await trx('indicators').where({enrollment_id: enrollmentId, period}).first();
      if (existing) throw new ConflictException('Este mês já possui um registro. Abra o registro existente para corrigir ou reativar.');
      const id = randomUUID(); await trx('indicators').insert({id, organization_id: user.organizationId, enrollment_id: enrollmentId,
        created_by: user.id, period, source_type: 'manual', draft: JSON.stringify(data)});
      await audit(trx, user, 'indicator', id, 'Indicadores mensais iniciados', {period, sourceType: 'manual'});
      return {id, draftVersion: 1};
    });
  }
  async save(user: User, id: string, input: z.infer<typeof saveInput>) {
    staff(user); const {expectedVersion: expected, reason: correctionReason, ...raw} = input; const data = indicatorDataSchema.parse(raw);
    return db.transaction(async trx => {
      const row = await this.lockIndicator(user, id, trx); mutable(row); checkVersion(row, expected);
      validateIndicatorPeriod(row.period, data.periodStatus);
      if (row.published_version > 0 && !correctionReason) throw new BadRequestException('Explique o motivo da correção dos dados já publicados.');
      await trx('indicators').where({id}).update({draft: JSON.stringify(data), draft_version: row.draft_version + 1, updated_at: new Date()});
      await audit(trx, user, 'indicator', id, row.published_version ? 'Correção de indicadores preparada' : 'Minuta de indicadores atualizada',
        {reason: correctionReason, before: row.draft, after: data, draftVersion: row.draft_version + 1});
      return {ok: true, draftVersion: row.draft_version + 1};
    });
  }
  async publish(user: User, id: string, expected: number) {
    staff(user);
    return db.transaction(async trx => {
      const row = await this.lockIndicator(user, id, trx); mutable(row); checkVersion(row, expected);
      const data = indicatorDataSchema.parse(row.draft); validateIndicatorPeriod(row.period, data.periodStatus); validateIndicatorPublication(data);
      const hash = indicatorFingerprint(data); const latest = await trx('indicator_revisions').where({indicator_id: id, version: row.published_version}).first();
      if (latest?.snapshot_hash === hash) return {ok: true, version: row.published_version, publishedVersion: row.published_version,
        draftVersion: row.draft_version, alreadyPublished: true};
      const version = row.published_version + 1;
      await trx('indicator_revisions').insert({id: randomUUID(), organization_id: user.organizationId, enrollment_id: row.enrollment_id,
        indicator_id: id, period: row.period, version, source_draft_version: row.draft_version, snapshot: JSON.stringify(data),
        snapshot_hash: hash, published_by: user.id});
      await trx('indicators').where({id}).update({published_version: version, status: 'published', updated_at: new Date()});
      await audit(trx, user, 'indicator', id, 'Indicadores mensais publicados', {period: row.period, version, draftVersion: row.draft_version});
      return {ok: true, version, publishedVersion: version, draftVersion: row.draft_version, alreadyPublished: false};
    });
  }
  async status(user: User, id: string, input: {expectedVersion: number; status: 'active' | 'archived'; reason: string}) {
    staff(user);
    return db.transaction(async trx => {
      const row = await this.lockIndicator(user, id, trx); checkVersion(row, input.expectedVersion);
      if ((row.status === 'archived') === (input.status === 'archived')) throw new BadRequestException('Este registro já está nessa situação.');
      const status = input.status === 'archived' ? 'archived' : row.published_version ? 'published' : 'draft';
      await trx('indicators').where({id}).update({status, draft_version: row.draft_version + 1, updated_at: new Date(),
        archive_reason: input.status === 'archived' ? input.reason : null, archived_by: input.status === 'archived' ? user.id : null,
        archived_at: input.status === 'archived' ? new Date() : null});
      await audit(trx, user, 'indicator', id, input.status === 'archived' ? 'Indicadores arquivados' : 'Indicadores reativados', {reason: input.reason, status});
      return {ok: true, status, draftVersion: row.draft_version + 1};
    });
  }
  private async publishedForEnrollment(user: User, enrollmentId: string, connection: Connection = db) {
    return connection('indicators as i').join('indicator_revisions as r', function () { this.on('r.indicator_id', '=', 'i.id').andOn('r.version', '=', 'i.published_version'); })
      .where({'i.organization_id': user.organizationId, 'i.enrollment_id': enrollmentId}).whereNot('i.status', 'archived')
      .select('i.id', 'i.period', 'r.version', 'r.snapshot', 'r.published_at');
  }
  private goalDto(row: any, point?: {period: string; data: IndicatorData | null}) {
    const goal = {period: row.period, metricKey: row.metric_key, target: row.target, direction: row.direction};
    return {id: row.id, enrollmentId: row.enrollment_id, enrollmentStatus: row.enrollmentStatus, clientId: row.clientId, clientName: row.clientName,
      ...goal, planId: row.plan_id, planTitle: row.planTitle || null, notes: row.notes, version: row.version, status: row.status,
      evaluation: evaluateIndicatorGoal(goal, point), createdAt: row.created_at, updatedAt: row.updated_at};
  }
  async goals(user: User, filters: {enrollmentId?: string; period?: string; status?: string; planId?: string} = {}) {
    let query = this.scoped(user, 'indicator_goals').leftJoin('action_plans as p', 'p.id', 'i.plan_id')
      .select('i.*', 'e.status as enrollmentStatus', 'c.id as clientId', 'c.name as clientName', 'p.title as planTitle').orderBy('i.period', 'desc');
    if (filters.enrollmentId) query = query.where('i.enrollment_id', filters.enrollmentId);
    if (filters.period) query = query.where('i.period', filters.period);
    if (filters.status) query = query.where('i.status', filters.status);
    if (filters.planId) query = query.where('i.plan_id', filters.planId);
    const rows = await query;
    const points = new Map<string, any[]>();
    for (const enrollmentId of new Set(rows.map(row => row.enrollment_id))) points.set(enrollmentId, await this.publishedForEnrollment(user, enrollmentId));
    return rows.map(row => { const record = points.get(row.enrollment_id)?.find(point => point.period === row.period);
      return this.goalDto(row, record ? {period: row.period, data: record.snapshot} : undefined); });
  }
  async goalDetail(user: User, id: string) {
    const row = await this.goalRow(user, id);
    const result: Record<string, unknown> = (await this.goals(user, {enrollmentId: row.enrollment_id})).find(goal => goal.id === id)!;
    if (user.role !== 'mentee') result.history = await db('audit_events as a').leftJoin('users as u', 'u.id', 'a.actor_id')
      .where({'a.organization_id': user.organizationId, 'a.entity_type': 'indicator_goal', 'a.entity_id': id})
      .select('a.id', 'a.action', 'a.details', 'a.created_at as createdAt', 'u.name as actorName').orderBy('a.created_at', 'desc').limit(200);
    return result;
  }
  async createGoal(user: User, input: z.infer<typeof createGoalInput>) {
    staff(user); const canonicalTarget = normalizeIndicatorGoal(input.metricKey, input.target);
    return db.transaction(async trx => {
      await this.lockEnrollment(user, input.enrollmentId, trx); await this.plan(user, input.enrollmentId, input.planId, trx);
      if (await trx('indicator_goals').where({enrollment_id: input.enrollmentId, period: input.period, metric_key: input.metricKey}).first())
        throw new ConflictException('Este indicador já possui uma meta para o mês. Corrija ou reative a meta existente.');
      const id = randomUUID(); await trx('indicator_goals').insert({id, organization_id: user.organizationId, enrollment_id: input.enrollmentId,
        created_by: user.id, period: input.period, metric_key: input.metricKey, target: canonicalTarget, direction: input.direction,
        plan_id: input.planId || null, notes: input.notes});
      await audit(trx, user, 'indicator_goal', id, 'Meta mensal definida', {...input, target: canonicalTarget});
      return {id, version: 1};
    });
  }
  private async goalRow(user: User, id: string, connection: Connection = db) {
    const row = await this.scoped(user, 'indicator_goals', connection).where('i.id', id).select('i.*').first();
    if (!row) throw new NotFoundException('Meta não encontrada.'); return row;
  }
  async updateGoal(user: User, id: string, input: z.infer<typeof patchGoalInput>) {
    staff(user);
    return db.transaction(async trx => {
      const current = await this.goalRow(user, id, trx); await this.lockEnrollment(user, current.enrollment_id, trx);
      if (input.planId !== undefined && input.planId !== current.plan_id) await this.plan(user, current.enrollment_id, input.planId, trx);
      const row = await trx('indicator_goals').where({id, organization_id: user.organizationId}).forUpdate().first();
      mutable(row); checkVersion(row, input.expectedVersion, 'version');
      const period = input.period || row.period; const metric = input.metricKey || row.metric_key;
      const canonicalTarget = normalizeIndicatorGoal(metric, input.target ?? row.target);
      if (await trx('indicator_goals').where({enrollment_id: row.enrollment_id, period, metric_key: metric}).whereNot({id}).first())
        throw new ConflictException('Já existe uma meta deste indicador para o mês.');
      const patch = {period, metric_key: metric, target: canonicalTarget, direction: input.direction || row.direction,
        plan_id: input.planId !== undefined ? input.planId : row.plan_id, notes: input.notes ?? row.notes, version: row.version + 1, updated_at: new Date()};
      await trx('indicator_goals').where({id}).update(patch);
      await audit(trx, user, 'indicator_goal', id, 'Meta mensal corrigida', {reason: input.reason, before: row, changes: patch});
      return {ok: true, version: row.version + 1};
    });
  }
  async goalStatus(user: User, id: string, input: {expectedVersion: number; status: 'active' | 'archived'; reason: string}) {
    staff(user);
    return db.transaction(async trx => {
      const current = await this.goalRow(user, id, trx); await this.lockEnrollment(user, current.enrollment_id, trx);
      const row = await trx('indicator_goals').where({id, organization_id: user.organizationId}).forUpdate().first();
      checkVersion(row, input.expectedVersion, 'version');
      if (row.status === input.status) throw new BadRequestException('Esta meta já está nessa situação.');
      await trx('indicator_goals').where({id}).update({status: input.status, version: row.version + 1, updated_at: new Date(),
        archive_reason: input.status === 'archived' ? input.reason : null, archived_by: input.status === 'archived' ? user.id : null,
        archived_at: input.status === 'archived' ? new Date() : null});
      await audit(trx, user, 'indicator_goal', id, input.status === 'archived' ? 'Meta arquivada' : 'Meta reativada', {reason: input.reason});
      return {ok: true, status: input.status, version: row.version + 1};
    });
  }
  async evolution(user: User, enrollmentId: string, from: string, to: string) {
    await enrollment(user, enrollmentId);
    if (from > to) throw new BadRequestException('O início do intervalo precisa ser anterior ao fim.');
    const span = (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5)) - Number(from.slice(5)) + 1;
    if (span > 36) throw new BadRequestException('Consulte até 36 meses por vez.');
    const months = indicatorMonths(from, to); const records = await this.publishedForEnrollment(user, enrollmentId);
    const goals = await this.goals(user, {enrollmentId, status: 'active'});
    const points = months.map(period => {
      const record = records.find(row => row.period === period); const previous = records.find(row => row.period === previousIndicatorMonth(period));
      const data = record?.snapshot || null;
      return {period, recordId: record?.id || null, publishedVersion: record?.version || null, publishedAt: record?.published_at || null,
        data, metrics: data ? computeIndicatorMetrics(data) : null,
        comparison: compareIndicatorPeriods({period, data}, {period: previousIndicatorMonth(period), data: previous?.snapshot || null}),
        goals: goals.filter(goal => goal.period === period)};
    });
    return {enrollmentId, from, to, metricDefinitions: METRIC_DEFINITIONS, points};
  }
  async evolutionCsv(user: User, enrollmentId: string, from: string, to: string) {
    const result = await this.evolution(user, enrollmentId, from, to);
    const units = {BRL: 'R$', count: 'quantidade', percent: '%', ratio: 'vezes'};
    return reportCsv([
      ['Período', 'Situação', 'Base dos dados', 'Versão publicada',
        ...INDICATOR_KEYS.map(key => `${METRIC_DEFINITIONS[key].label} (${units[METRIC_DEFINITIONS[key].unit]})`)],
      ...result.points.map(point => [point.period,
        point.data ? point.data.periodStatus === 'closed' ? 'Fechado' : 'Parcial' : 'Sem publicação',
        point.data?.sourceLabel ?? 'Não informado', point.publishedVersion ?? 'Não informado',
        ...INDICATOR_KEYS.map(key => {
          const reading = point.metrics?.[key];
          if (reading?.value == null) return 'Não informado';
          return (reading.unit === 'BRL' ? reading.value.toFixed(2) : String(reading.value)).replace('.', ',');
        })]),
    ]);
  }
  private async csvClassification(user: User, enrollmentId: string, csvText: string, connection: Connection = db) {
    const existing = await connection('indicators').where({organization_id: user.organizationId, enrollment_id: enrollmentId}).select('id', 'period', 'status');
    return classifyIndicatorCsv(csvText, enrollmentId, existing);
  }
  async csvPreview(user: User, enrollmentId: string, csvText: string) {
    staff(user); const e = await enrollment(user, enrollmentId);
    if (e.status !== 'active') throw new BadRequestException('A contratação precisa estar ativa para preparar indicadores.');
    const preview = await this.csvClassification(user, enrollmentId, csvText);
    const token = !preview.errors.length && preview.counts.create > 0
      ? issueIndicatorPreview({actorId: user.id, organizationId: user.organizationId, enrollmentId, csvHash: indicatorCsvHash(csvText)}, indicatorImportHash(preview))
      : {previewToken: null, expiresAt: null};
    return {...preview, ...token};
  }
  async csvImport(user: User, input: z.infer<typeof csvImportInput>) {
    staff(user);
    const csvHash = indicatorCsvHash(input.csvText);
    const payloadHash = indicatorImportHash({actorId: user.id, organizationId: user.organizationId, enrollmentId: input.enrollmentId,
      csvHash, previewToken: input.previewToken, confirmed: input.confirmed, duplicatePolicy: input.duplicatePolicy, fileName: input.fileName || null});
    return db.transaction(async trx => {
      // A key is organization-wide, including retries that accidentally choose another enrollment.
      await trx.raw('SELECT pg_advisory_xact_lock(hashtextextended(?, 0))', [`elo:indicator-import:${user.organizationId}:${input.requestKey}`]);
      const e = await this.lockEnrollment(user, input.enrollmentId, trx);
      const prior = await trx('indicator_imports').where({organization_id: user.organizationId, request_key: input.requestKey}).first();
      if (prior) {
        if (prior.created_by !== user.id || prior.payload_hash !== payloadHash)
          throw new ConflictException({code: 'CSV_IMPORT_KEY_REUSED', message: 'Esta tentativa já foi usada com outro conteúdo. Gere uma nova prévia para iniciar outra importação.'});
        return importDto(prior, true);
      }
      const claims = verifyIndicatorPreview(input.previewToken, {actorId: user.id, organizationId: user.organizationId,
        enrollmentId: input.enrollmentId, csvHash});
      const preview = await this.csvClassification(user, input.enrollmentId, input.csvText, trx);
      const previewHash = indicatorImportHash(preview);
      if (claims.previewHash !== previewHash)
        throw new ConflictException({code: 'CSV_PREVIEW_CHANGED', message: 'Os registros mudaram desde a prévia. Confira o arquivo novamente antes de importar.'});
      if (preview.errors.length)
        throw new BadRequestException({code: 'CSV_IMPORT_INVALID', message: 'Corrija os erros do arquivo antes de importar.'});
      if (!preview.counts.create)
        throw new BadRequestException({code: 'CSV_IMPORT_EMPTY', message: 'Não há meses novos e válidos para importar.'});
      const id = randomUUID(); const createdAt = new Date();
      const candidates: {id: string; period: string; data: IndicatorData; line: number}[] = [];
      const rows: IndicatorImportReportRow[] = preview.rows.map(row => {
        const period = row.data?.period || row.period;
        if (row.classification === 'create') {
          const indicatorId = randomUUID(); const {period: validatedPeriod, ...data} = row.data;
          candidates.push({id: indicatorId, period: validatedPeriod, data, line: row.line});
          return {line: row.line, period, status: 'imported', indicatorId, errors: []};
        }
        return {line: row.line, ...(period ? {period} : {}), status: row.classification === 'conflict' ? 'skipped' : 'invalid',
          ...(row.existingId ? {existingId: row.existingId, existingStatus: row.existingStatus} : {}), errors: row.errors};
      });
      const report: IndicatorImportReport = {counts: {total: rows.length, imported: candidates.length,
        skipped: rows.filter(row => row.status === 'skipped').length, invalid: rows.filter(row => row.status === 'invalid').length},
        rows, errors: [], duplicatePolicy: 'skip_existing'};
      const client = await trx('clients').where({id: e.client_id, organization_id: user.organizationId}).first();
      const batch = {id, organization_id: user.organizationId, enrollment_id: e.id, created_by: user.id, created_by_name: user.name,
        client_name: client.name, request_key: input.requestKey, payload_hash: payloadHash, csv_hash: csvHash,
        preview_hash: previewHash, report_version: 1, file_name: safeImportFileName(input.fileName), duplicate_policy: 'skip_existing',
        report, created_at: createdAt};
      await trx('indicator_imports').insert({...batch, report: JSON.stringify(report)});
      for (const candidate of candidates) {
        await trx('indicators').insert({id: candidate.id, organization_id: user.organizationId, enrollment_id: e.id,
          created_by: user.id, period: candidate.period, source_type: 'csv', draft: JSON.stringify(candidate.data),
          draft_version: 1, published_version: 0, status: 'draft'});
        await audit(trx, user, 'indicator', candidate.id, 'Indicadores importados como rascunho',
          {importId: id, period: candidate.period, sourceType: 'csv', line: candidate.line});
      }
      await audit(trx, user, 'indicator_import', id, 'Importação de indicadores concluída', {counts: report.counts, duplicatePolicy: 'skip_existing'});
      return importDto(batch, true);
    });
  }
  async imports(user: User, enrollmentId: string) {
    staff(user); await enrollment(user, enrollmentId);
    const rows = await this.scoped(user, 'indicator_imports').where('i.enrollment_id', enrollmentId).select('i.*').orderBy('i.created_at', 'desc');
    return rows.map(row => importDto(row));
  }
  async importDetail(user: User, id: string) {
    staff(user);
    const row = await this.scoped(user, 'indicator_imports').where('i.id', id).select('i.*').first();
    if (!row) throw new NotFoundException('Importação não encontrada.'); return importDto(row, true);
  }
}

@Controller('api')
class IndicatorsController {
  constructor(@Inject(IndicatorsService) private readonly service: IndicatorsService) {}
  @Get('indicators/evolution') evolution(@Req() req: any, @Query() query: unknown) {
    const q = evolutionQuery.parse(query);
    return this.service.evolution(req.user, q.enrollmentId, q.from, q.to);
  }
  @Get('indicators/evolution/export.csv') async evolutionCsv(@Req() req: any, @Query() query: unknown, @Res() res: any) {
    const q = evolutionQuery.parse(query);
    const content = await this.service.evolutionCsv(req.user, q.enrollmentId, q.from, q.to);
    res.header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="evolucao-${q.enrollmentId}-${q.from}-${q.to}.csv"`)
      .header('Cache-Control', 'private, no-store').header('X-Content-Type-Options', 'nosniff').send(content);
  }
  @Get('indicators/csv-template') template(@Req() req: any, @Res() res: any) {
    staff(req.user); res.header('Content-Type', 'text/csv; charset=utf-8').header('Content-Disposition', 'attachment; filename="indicadores-v1.csv"')
      .header('Cache-Control', 'private, no-store').send(indicatorCsvTemplate(previousIndicatorMonth(currentIndicatorMonth())));
  }
  @Post('indicators/csv-preview') preview(@Req() req: any, @Body() body: unknown) {
    staff(req.user);
    const input = z.object({enrollmentId: uuid, csvText: z.string().min(1).max(65536)}).strict().parse(body);
    return this.service.csvPreview(req.user, input.enrollmentId, input.csvText);
  }
  @Post('indicators/csv-import') importCsv(@Req() req: any, @Body() body: unknown) {
    staff(req.user); return this.service.csvImport(req.user, csvImportInput.parse(body));
  }
  @Get('indicators/imports') imports(@Req() req: any, @Query() query: unknown) {
    staff(req.user); return this.service.imports(req.user, z.object({enrollmentId: uuid}).strict().parse(query).enrollmentId);
  }
  @Get('indicators/imports/:id/report.csv') async importReport(@Req() req: any, @Param('id') id: string, @Res() res: any) {
    staff(req.user); const validId = uuid.parse(id); const report = await this.service.importDetail(req.user, validId);
    res.header('Content-Type', 'text/csv; charset=utf-8').header('Content-Disposition', `attachment; filename="importacao-indicadores-${validId}.csv"`)
      .header('X-Content-Type-Options', 'nosniff').header('Cache-Control', 'private, no-store')
      .send(indicatorImportReportCsv(report as IndicatorImportReport));
  }
  @Get('indicators/imports/:id') importDetail(@Req() req: any, @Param('id') id: string) {
    staff(req.user); return this.service.importDetail(req.user, uuid.parse(id));
  }
  @Get('indicators') list(@Req() req: any, @Query() query: unknown) {
    return this.service.list(req.user, z.object({enrollmentId: uuid.optional(), status: z.enum(['draft', 'published', 'archived']).optional(),
      from: indicatorPeriodSchema.optional(), to: indicatorPeriodSchema.optional()}).strict().parse(query));
  }
  @Post('indicators') create(@Req() req: any, @Body() body: unknown) { return this.service.create(req.user, createIndicatorSchema.parse(body)); }
  @Get('indicators/:id') detail(@Req() req: any, @Param('id') id: string, @Query() query: unknown) {
    const q = z.object({version: z.coerce.number().int().positive().optional()}).strict().parse(query);
    return this.service.detail(req.user, uuid.parse(id), q.version);
  }
  @Patch('indicators/:id') save(@Req() req: any, @Param('id') id: string, @Body() body: unknown) { return this.service.save(req.user, uuid.parse(id), saveInput.parse(body)); }
  @Post('indicators/:id/publish') publish(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    return this.service.publish(req.user, uuid.parse(id), z.object({expectedVersion}).strict().parse(body).expectedVersion);
  }
  @Post('indicators/:id/status') status(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    return this.service.status(req.user, uuid.parse(id), z.object({expectedVersion, status: z.enum(['active', 'archived']), reason}).strict().parse(body));
  }
  @Get('indicator-goals') goals(@Req() req: any, @Query() query: unknown) {
    return this.service.goals(req.user, z.object({enrollmentId: uuid.optional(), period: indicatorPeriodSchema.optional(),
      status: z.enum(['active', 'archived']).optional(), planId: uuid.optional()}).strict().parse(query));
  }
  @Post('indicator-goals') createGoal(@Req() req: any, @Body() body: unknown) { return this.service.createGoal(req.user, createGoalInput.parse(body)); }
  @Get('indicator-goals/:id') goalDetail(@Req() req: any, @Param('id') id: string) { return this.service.goalDetail(req.user, uuid.parse(id)); }
  @Patch('indicator-goals/:id') updateGoal(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    return this.service.updateGoal(req.user, uuid.parse(id), patchGoalInput.parse(body));
  }
  @Post('indicator-goals/:id/status') goalStatus(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    return this.service.goalStatus(req.user, uuid.parse(id), z.object({expectedVersion, status: z.enum(['active', 'archived']), reason}).strict().parse(body));
  }
}
@Module({controllers: [IndicatorsController], providers: [IndicatorsService], exports: [IndicatorsService]})
export class IndicatorsModule {}
