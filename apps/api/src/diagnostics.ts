import {
  BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get,
  Inject, Injectable, Module, NotFoundException, Param, Patch, Post, Query, Req,
} from '@nestjs/common';
import {createHash, randomUUID} from 'node:crypto';
import type {Knex} from 'knex';
import {z} from 'zod';
import {db} from './db';
import {User} from './auth';
import {admin, enrollment, scopedEnrollments} from './access';

type Connection = Knex | Knex.Transaction;
export const DIAGNOSIS_AREAS = {
  catalog: 'Catálogo e anúncios', pricing: 'Preços, custos e margem', stock: 'Estoque e disponibilidade',
  logistics: 'Logística, Envios e Full', reputation: 'Reputação e atendimento', advertising: 'Publicidade e desempenho',
  operations: 'Processos e equipe', priorities: 'Bloqueios e prioridades',
} as const;
export const DEFAULT_DIAGNOSIS_AREAS = [
  {area: 'catalog', prompt: 'Como estão os anúncios, fotos, títulos e fichas técnicas dos produtos prioritários?'},
  {area: 'pricing', prompt: 'Os preços consideram custos de compra, tarifas, frete, devoluções e margem?'},
  {area: 'stock', prompt: 'O saldo de estoque é confiável e os itens prioritários estão disponíveis?'},
  {area: 'logistics', prompt: 'Como estão os prazos, a operação de Mercado Envios e o uso de Full, quando aplicável?'},
  {area: 'reputation', prompt: 'Quais reclamações, cancelamentos ou atrasos afetam a reputação da loja?'},
  {area: 'advertising', prompt: 'Quais dados existem sobre campanhas, vendas, conversão e retorno publicitário?'},
  {area: 'operations', prompt: 'As rotinas, responsabilidades e controles da equipe estão definidos?'},
  {area: 'priorities', prompt: 'Quais bloqueios devem ser tratados primeiro e quais informações ainda faltam?'},
] as const;

const uuid = z.string().uuid();
const title = z.string().trim().min(1).max(200);
const content = z.string().trim().min(1).max(10000);
const optionalContent = z.string().trim().max(10000);
const area = z.enum(['catalog', 'pricing', 'stock', 'logistics', 'reputation', 'advertising', 'operations', 'priorities']);
const maturity = z.enum(['not_informed', 'starting', 'organizing', 'scaling']);
const priority = z.enum(['low', 'normal', 'high']);
const assessment = z.enum(['not_assessed', 'adequate', 'attention', 'critical', 'not_applicable']);
const expectedVersion = z.number().int().positive();
const httpsUrl = z.url().max(2048).refine(value => {
  const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password;
}, 'Use um link HTTPS sem credenciais.');
const templateAreas = z.array(z.object({area, prompt: z.string().trim().min(1).max(2000)}).strict()).min(1).max(8)
  .refine(rows => new Set(rows.map(row => row.area)).size === rows.length, 'Use cada área uma única vez no modelo.');
export const diagnosticFindingSchema = z.object({
  id: uuid, area, prompt: z.string().trim().max(2000).default(''),
  assessment: assessment.default('not_assessed'), observation: optionalContent.default(''),
  recommendation: optionalContent.default(''), priority: priority.default('normal'), evidenceUrl: httpsUrl.optional(),
}).strict();
const findings = z.array(diagnosticFindingSchema).min(1).max(80)
  .refine(rows => new Set(rows.map(row => row.id)).size === rows.length, 'Os identificadores dos achados não podem se repetir.');
export const diagnosticDraftSchema = z.object({title, context: optionalContent, maturity, findings}).strict();
type Draft = z.infer<typeof diagnosticDraftSchema>;
const createInput = z.object({enrollmentId: uuid, templateId: uuid.optional(), title,
  context: optionalContent.default(''), maturity: maturity.default('not_informed'), findings: findings.optional()}).strict();
const saveInput = diagnosticDraftSchema.extend({expectedVersion}).strict();
const templateCreateInput = z.object({name: title, description: optionalContent.default(''), areas: templateAreas, active: z.boolean().default(true)}).strict();
const templatePatchInput = z.object({expectedVersion, name: title.optional(), description: optionalContent.optional(),
  areas: templateAreas.optional(), active: z.boolean().optional()}).strict()
  .refine(value => Object.keys(value).some(key => key !== 'expectedVersion'), 'Informe uma alteração.');
const createPlanInput = z.object({version: expectedVersion, title: title.optional(), objective: content.optional(),
  target: optionalContent.optional(), priority: priority.optional(), staleDays: z.number().int().min(1).max(365).default(7)}).strict();

function staff(user: User) { if (user.role === 'mentee') throw new ForbiddenException('A equipe de mentoria prepara os diagnósticos técnicos.'); }
function active(e: any) { if (e.status !== 'active') throw new BadRequestException('A contratação precisa estar ativa para alterar o diagnóstico.'); }
function mutable(row: any) { if (row.status === 'archived') throw new BadRequestException('Reative o diagnóstico com uma justificativa antes de alterá-lo.'); }
function checkVersion(row: any, expected: number, field = 'draft_version') {
  if (row[field] !== expected) throw new ConflictException('Outra pessoa atualizou este conteúdo. Recarregue a versão atual antes de salvar.');
}
async function audit(connection: Connection, user: User, type: string, id: string, action: string, details: unknown) {
  await connection('audit_events').insert({id: randomUUID(), organization_id: user.organizationId,
    actor_id: user.id, entity_type: type, entity_id: id, action, details: JSON.stringify(details)});
}
function canonical(value: any): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().filter(key => value[key] !== undefined)
    .map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
export function diagnosticFingerprint(draft: Draft) { return createHash('sha256').update(canonical(draft)).digest('hex'); }
export function validateDiagnosticSize(draft: Draft) {
  if (Buffer.byteLength(JSON.stringify(draft), 'utf8') > 64 * 1024) {
    throw new BadRequestException('O diagnóstico está muito longo. Resuma as observações ou divida a avaliação em mais de um diagnóstico.');
  }
}
export function validateDiagnosticPublication(draft: Draft) {
  if (!draft.context.trim()) throw new BadRequestException('Registre o contexto e o resumo do diagnóstico antes de publicar.');
  if (!draft.findings.some(finding => finding.assessment !== 'not_assessed')) throw new BadRequestException('Avalie pelo menos uma área antes de publicar.');
  for (const finding of draft.findings) {
    if (finding.assessment !== 'not_assessed' && !finding.observation.trim()) {
      throw new BadRequestException(finding.assessment === 'not_applicable'
        ? 'Explique por que a área não se aplica a este cliente.' : 'Registre uma observação para cada área avaliada.');
    }
  }
}
function templateDto(row: any) {
  return {id: row.id, name: row.name, description: row.description, areas: row.areas,
    version: row.version, active: row.active, createdAt: row.created_at, updatedAt: row.updated_at};
}
function publishedDto(row: any) {
  return row ? {...row.snapshot, version: row.version, publishedAt: row.published_at} : null;
}

@Injectable()
export class DiagnosticsService {
  private scoped(user: User, connection: Connection = db) {
    const query = connection('diagnoses as d').join('enrollments as e', 'e.id', 'd.enrollment_id')
      .join('clients as c', 'c.id', 'e.client_id').where('d.organization_id', user.organizationId)
      .whereIn('d.enrollment_id', scopedEnrollments(user, connection).select('e.id'));
    if (user.role === 'mentee') query.where('d.published_version', '>', 0);
    return query;
  }
  private async diagnosisRow(user: User, id: string, connection: Connection = db) {
    const row = await this.scoped(user, connection).where('d.id', id).select('d.*', 'e.status as enrollmentStatus',
      'c.id as clientId', 'c.name as clientName').first();
    if (!row) throw new NotFoundException('Diagnóstico não encontrado.');
    return row;
  }
  private async lockEnrollment(user: User, id: string, trx: Knex.Transaction) {
    await enrollment(user, id, trx);
    await trx('enrollments').where({id, organization_id: user.organizationId}).forUpdate().first();
    const e = await enrollment(user, id, trx); active(e); return e;
  }
  private async lockDiagnosis(user: User, id: string, trx: Knex.Transaction) {
    const current = await this.diagnosisRow(user, id, trx);
    const e = await this.lockEnrollment(user, current.enrollment_id, trx);
    const row = await trx('diagnoses').where({id, organization_id: user.organizationId}).forUpdate().first();
    if (!row) throw new NotFoundException('Diagnóstico não encontrado.');
    return {row, e};
  }
  private async revision(user: User, id: string, version: number, connection: Connection) {
    const row = await connection('diagnosis_revisions').where({diagnosis_id: id, organization_id: user.organizationId, version}).first();
    if (!row) throw new NotFoundException('Versão publicada não encontrada.');
    return row;
  }

  async templates(user: User) {
    staff(user);
    const query = db('diagnosis_templates').where({organization_id: user.organizationId});
    if (user.role !== 'admin') query.where({active: true});
    return (await query.orderBy('name')).map(templateDto);
  }
  async createTemplate(user: User, input: z.infer<typeof templateCreateInput>) {
    admin(user);
    return db.transaction(async trx => {
      const id = randomUUID();
      await trx('diagnosis_templates').insert({id, organization_id: user.organizationId, created_by: user.id,
        name: input.name, description: input.description, areas: JSON.stringify(input.areas), active: input.active});
      await audit(trx, user, 'diagnosis_template', id, 'Modelo de diagnóstico criado', input);
      return {id, version: 1};
    });
  }
  async updateTemplate(user: User, id: string, input: z.infer<typeof templatePatchInput>) {
    admin(user);
    return db.transaction(async trx => {
      const row = await trx('diagnosis_templates').where({id, organization_id: user.organizationId}).forUpdate().first();
      if (!row) throw new NotFoundException('Modelo não encontrado.');
      checkVersion(row, input.expectedVersion, 'version');
      const patch: Record<string, unknown> = {version: row.version + 1, updated_at: new Date()};
      for (const field of ['name', 'description', 'active'] as const) if (input[field] !== undefined) patch[field] = input[field];
      if (input.areas) patch.areas = JSON.stringify(input.areas);
      await trx('diagnosis_templates').where({id}).update(patch);
      await audit(trx, user, 'diagnosis_template', id, 'Modelo de diagnóstico atualizado', {before: templateDto(row), changes: input});
      return {ok: true, version: row.version + 1};
    });
  }

  async list(user: User, filters: {enrollmentId?: string; status?: string} = {}) {
    let query = this.scoped(user).select('d.*', 'e.status as enrollmentStatus', 'c.id as clientId', 'c.name as clientName').orderBy('d.created_at', 'desc');
    if (filters.enrollmentId) query = query.where('d.enrollment_id', filters.enrollmentId);
    if (filters.status) query = query.where('d.status', filters.status);
    const rows = await query;
    if (!rows.length) return [];
    const revisions = await db('diagnosis_revisions').where({organization_id: user.organizationId}).whereIn('diagnosis_id', rows.map(row => row.id));
    return rows.map(row => {
      const published = revisions.find(revision => revision.diagnosis_id === row.id && revision.version === row.published_version);
      const visible = user.role === 'mentee' ? published!.snapshot : row.draft;
      return {id: row.id, enrollmentId: row.enrollment_id, enrollmentStatus: row.enrollmentStatus,
        clientId: row.clientId, clientName: row.clientName, title: visible.title, context: visible.context,
        maturity: visible.maturity, status: row.status, publishedVersion: row.published_version || null,
        publishedAt: published?.published_at || null, ...(user.role !== 'mentee' ? {draftVersion: row.draft_version,
          hasUnpublishedChanges: !published || published.snapshot_hash !== diagnosticFingerprint(row.draft)} : {}),
        createdAt: row.created_at, ...(user.role !== 'mentee' ? {updatedAt: row.updated_at} : {})};
    });
  }
  async detail(user: User, id: string, version?: number) {
    const row = await this.diagnosisRow(user, id);
    const revisions = await db('diagnosis_revisions').where({diagnosis_id: id, organization_id: user.organizationId}).orderBy('version', 'desc');
    const selected = version ? revisions.find(revision => revision.version === version) : revisions[0];
    if (version && !selected) throw new NotFoundException('Versão publicada não encontrada.');
    const links = await db('diagnosis_plan_links as l').join('action_plans as p', 'p.id', 'l.plan_id')
      .join('diagnosis_revisions as r', 'r.id', 'l.revision_id')
      .where({'l.diagnosis_id': id, 'l.organization_id': user.organizationId})
      .select('l.id', 'l.plan_id as planId', 'p.title as planTitle', 'p.status as planStatus', 'r.version',
        'l.finding_id as findingId', 'l.finding_area as findingArea', 'l.linked_at as linkedAt', 'l.created_from_finding as createdFromFinding')
      .orderBy('l.linked_at', 'desc');
    const result: Record<string, unknown> = {id: row.id, enrollmentId: row.enrollment_id,
      enrollmentStatus: row.enrollmentStatus, clientId: row.clientId, clientName: row.clientName, status: row.status,
      publishedVersion: row.published_version || null, published: publishedDto(selected),
      revisions: revisions.map(revision => ({version: revision.version, publishedAt: revision.published_at})),
      linkedPlans: links, createdAt: row.created_at};
    if (user.role !== 'mentee') {
      result.draftVersion = row.draft_version; result.draft = row.draft; result.templateSnapshot = row.template_snapshot;
      result.hasUnpublishedChanges = !revisions[0] || revisions[0].snapshot_hash !== diagnosticFingerprint(row.draft);
      result.updatedAt = row.updated_at;
      result.history = await db('audit_events as a').leftJoin('users as u', 'u.id', 'a.actor_id')
        .where({'a.organization_id': user.organizationId, 'a.entity_type': 'diagnosis', 'a.entity_id': id})
        .select('a.id', 'a.action', 'a.details', 'a.created_at as createdAt', 'a.actor_id as actorId', 'u.name as actorName').orderBy('a.created_at', 'desc').limit(200);
    }
    return result;
  }

  async create(user: User, input: z.infer<typeof createInput>) {
    staff(user);
    return db.transaction(async trx => {
      const e = await this.lockEnrollment(user, input.enrollmentId, trx);
      let templateSnapshot: any = {id: null, name: 'Diagnóstico inicial da mentoria', description: 'Modelo inicial adaptável às necessidades do cliente.',
        version: 1, active: true, areas: DEFAULT_DIAGNOSIS_AREAS};
      if (input.templateId) {
        const template = await trx('diagnosis_templates').where({id: input.templateId, organization_id: user.organizationId, active: true}).first();
        if (!template) throw new BadRequestException('Escolha um modelo ativo da sua organização.');
        templateSnapshot = templateDto(template);
      }
      const draft = diagnosticDraftSchema.parse({title: input.title, context: input.context, maturity: input.maturity,
        findings: input.findings || templateSnapshot.areas.map((item: any) => ({id: randomUUID(), area: item.area, prompt: item.prompt}))});
      validateDiagnosticSize(draft);
      const id = randomUUID();
      await trx('diagnoses').insert({id, organization_id: user.organizationId, enrollment_id: e.id, created_by: user.id,
        template_id: input.templateId || null, template_snapshot: JSON.stringify(templateSnapshot), draft: JSON.stringify(draft)});
      await audit(trx, user, 'diagnosis', id, 'Diagnóstico técnico iniciado', {templateId: input.templateId, templateVersion: templateSnapshot.version, title: draft.title});
      return {id, draftVersion: 1};
    });
  }

  async save(user: User, id: string, input: z.infer<typeof saveInput>) {
    staff(user);
    return db.transaction(async trx => {
      const {row} = await this.lockDiagnosis(user, id, trx); mutable(row); checkVersion(row, input.expectedVersion);
      const {expectedVersion: _, ...draft} = input;
      validateDiagnosticSize(draft);
      const priorSnapshots = await trx('diagnosis_revisions').where({diagnosis_id: id}).select('snapshot');
      const known = [...row.draft.findings, ...priorSnapshots.flatMap(revision => revision.snapshot.findings)];
      for (const finding of draft.findings) {
        if (known.some(previous => previous.id === finding.id && previous.area !== finding.area)) {
          throw new BadRequestException('Mantenha a área do achado existente. Crie um novo achado para avaliar outra área.');
        }
      }
      const version = row.draft_version + 1;
      await trx('diagnoses').where({id}).update({draft: JSON.stringify(draft), draft_version: version, updated_at: new Date()});
      await audit(trx, user, 'diagnosis', id, 'Rascunho do diagnóstico atualizado', {before: row.draft, changes: draft, draftVersion: version});
      return {ok: true, draftVersion: version};
    });
  }

  async publish(user: User, id: string, expected: number) {
    staff(user);
    return db.transaction(async trx => {
      const {row, e} = await this.lockDiagnosis(user, id, trx); mutable(row); checkVersion(row, expected);
      const draft = diagnosticDraftSchema.parse(row.draft); validateDiagnosticPublication(draft);
      const fingerprint = diagnosticFingerprint(draft);
      const previous = await trx('diagnosis_revisions').where({diagnosis_id: id}).orderBy('version', 'desc').first();
      if (previous?.snapshot_hash === fingerprint) return {ok: true, version: previous.version, publishedVersion: previous.version, alreadyPublished: true, draftVersion: row.draft_version};
      const revisionId = randomUUID(), version = row.published_version + 1, now = new Date();
      await trx('diagnosis_revisions').insert({id: revisionId, organization_id: user.organizationId, diagnosis_id: id,
        enrollment_id: e.id, version, source_draft_version: row.draft_version, snapshot: JSON.stringify(draft), snapshot_hash: fingerprint,
        published_by: user.id, published_at: now});
      await trx('diagnoses').where({id}).update({published_version: version, status: 'published', updated_at: now});
      await audit(trx, user, 'diagnosis', id, 'Diagnóstico técnico publicado', {version, sourceDraftVersion: row.draft_version});
      const members = await trx('client_members as m').join('users as u', 'u.id', 'm.user_id')
        .where({'m.client_id': e.client_id, 'm.organization_id': user.organizationId, 'u.active': true}).select('u.id');
      for (const member of members) await trx('notifications').insert({id: randomUUID(), organization_id: user.organizationId,
        user_id: member.id, enrollment_id: e.id, diagnosis_id: id, dedupe_key: `diagnosis-published:${revisionId}`,
        title: 'Diagnóstico técnico disponível', body: draft.title,
      }).onConflict(['user_id', 'dedupe_key']).ignore();
      return {ok: true, version, publishedVersion: version, alreadyPublished: false, draftVersion: row.draft_version};
    });
  }

  async changeStatus(user: User, id: string, input: {expectedVersion: number; status: 'archived' | 'active'; reason: string}) {
    staff(user);
    return db.transaction(async trx => {
      const {row} = await this.lockDiagnosis(user, id, trx); checkVersion(row, input.expectedVersion);
      if (input.status === 'archived' && row.status === 'archived' || input.status === 'active' && row.status !== 'archived') {
        throw new BadRequestException('O diagnóstico já está nessa situação.');
      }
      const next = input.status === 'archived' ? 'archived' : row.published_version ? 'published' : 'draft';
      const version = row.draft_version + 1;
      await trx('diagnoses').where({id}).update({status: next, draft_version: version, updated_at: new Date(),
        archive_reason: input.status === 'archived' ? input.reason : null, archived_by: input.status === 'archived' ? user.id : null,
        archived_at: input.status === 'archived' ? new Date() : null});
      await audit(trx, user, 'diagnosis', id, input.status === 'archived' ? 'Diagnóstico arquivado' : 'Diagnóstico reativado', {from: row.status, to: next, reason: input.reason});
      return {ok: true, status: next, draftVersion: version};
    });
  }

  async linkPlan(user: User, id: string, input: {planId: string; version: number; findingId?: string}) {
    staff(user);
    return db.transaction(async trx => {
      const initial = await this.diagnosisRow(user, id, trx);
      await this.lockEnrollment(user, initial.enrollment_id, trx);
      const plan = await trx('action_plans').where({id: input.planId, organization_id: user.organizationId, enrollment_id: initial.enrollment_id}).forUpdate().first();
      if (!plan) throw new NotFoundException('Plano não encontrado nesta contratação.');
      if (plan.status !== 'active') throw new BadRequestException('Escolha um plano ativo para vincular ao diagnóstico.');
      const diagnosis = await trx('diagnoses').where({id, organization_id: user.organizationId}).forUpdate().first(); mutable(diagnosis);
      const revision = await this.revision(user, id, input.version, trx);
      const finding = input.findingId ? revision.snapshot.findings.find((item: any) => item.id === input.findingId) : null;
      if (input.findingId && !finding) throw new BadRequestException('O achado não pertence à versão publicada selecionada.');
      const existing = await trx('diagnosis_plan_links').where({revision_id: revision.id, plan_id: plan.id}).first();
      if (existing) {
        if ((existing.finding_id || null) !== (input.findingId || null)) {
          throw new ConflictException('Este plano já está vinculado a outra origem desta versão. Consulte o vínculo existente ou escolha outro plano.');
        }
        return {id: existing.id, planId: plan.id, created: false};
      }
      const linkId = randomUUID();
      await trx('diagnosis_plan_links').insert({id: linkId, organization_id: user.organizationId, enrollment_id: diagnosis.enrollment_id,
        diagnosis_id: id, revision_id: revision.id, plan_id: plan.id, finding_id: finding?.id || null,
        finding_area: finding?.area || null, created_from_finding: false, linked_by: user.id});
      await audit(trx, user, 'diagnosis', id, 'Plano de ação vinculado', {planId: plan.id, version: input.version, findingId: input.findingId});
      await audit(trx, user, 'action_plan', plan.id, 'Diagnóstico vinculado ao plano', {diagnosisId: id, version: input.version, findingId: input.findingId});
      return {id: linkId, planId: plan.id, created: true};
    });
  }

  async createPlan(user: User, id: string, findingId: string, input: z.infer<typeof createPlanInput>) {
    staff(user);
    return db.transaction(async trx => {
      const initial = await this.diagnosisRow(user, id, trx);
      await this.lockEnrollment(user, initial.enrollment_id, trx);
      const revision = await this.revision(user, id, input.version, trx);
      const previous = await trx('diagnosis_plan_links').where({revision_id: revision.id, finding_id: findingId, created_from_finding: true}).first();
      if (previous) await trx('action_plans').where({id: previous.plan_id, organization_id: user.organizationId}).forUpdate().first();
      const diagnosis = await trx('diagnoses').where({id, organization_id: user.organizationId}).forUpdate().first(); mutable(diagnosis);
      if (previous) return {id: previous.plan_id, planId: previous.plan_id, created: false};
      const finding = revision.snapshot.findings.find((item: any) => item.id === findingId);
      if (!finding) throw new NotFoundException('Achado não encontrado nesta versão publicada.');
      const objective = input.objective || finding.recommendation;
      if (!objective?.trim()) throw new BadRequestException('Informe o objetivo do plano ou publique uma recomendação para este achado.');
      const planId = randomUUID(), now = new Date();
      const planTitle = input.title || `Plano · ${DIAGNOSIS_AREAS[finding.area as keyof typeof DIAGNOSIS_AREAS]}`;
      // A new plan has no competing readers before commit; existing plans were locked before the diagnosis above.
      await trx('action_plans').insert({id: planId, organization_id: user.organizationId, enrollment_id: diagnosis.enrollment_id,
        created_by: user.id, title: planTitle, objective, baseline: finding.observation || null, target: input.target || null,
        priority: input.priority || finding.priority, status: 'active', stale_days: input.staleDays,
        last_progress_at: now, created_at: now, updated_at: now});
      await trx('diagnosis_plan_links').insert({id: randomUUID(), organization_id: user.organizationId, enrollment_id: diagnosis.enrollment_id,
        diagnosis_id: id, revision_id: revision.id, plan_id: planId, finding_id: findingId, finding_area: finding.area,
        created_from_finding: true, linked_by: user.id});
      await audit(trx, user, 'diagnosis', id, 'Achado convertido em plano de ação', {planId, findingId, version: input.version});
      await audit(trx, user, 'action_plan', planId, 'Plano criado a partir de diagnóstico técnico', {diagnosisId: id, findingId, version: input.version});
      return {id: planId, planId, created: true};
    });
  }
}

@Controller('api')
class DiagnosticsController {
  constructor(@Inject(DiagnosticsService) private readonly diagnostics: DiagnosticsService) {}
  @Get('diagnosis-templates') templates(@Req() req: any) { return this.diagnostics.templates(req.user); }
  @Post('diagnosis-templates') createTemplate(@Req() req: any, @Body() body: unknown) { return this.diagnostics.createTemplate(req.user, templateCreateInput.parse(body)); }
  @Patch('diagnosis-templates/:id') updateTemplate(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    return this.diagnostics.updateTemplate(req.user, uuid.parse(id), templatePatchInput.parse(body));
  }
  @Get('diagnoses') list(@Req() req: any, @Query() query: unknown) {
    return this.diagnostics.list(req.user, z.object({enrollmentId: uuid.optional(), status: z.enum(['draft', 'published', 'archived']).optional()}).parse(query));
  }
  @Get('diagnoses/:id') detail(@Req() req: any, @Param('id') id: string, @Query() query: unknown) {
    const parsed = z.object({version: z.coerce.number().int().positive().optional()}).parse(query);
    return this.diagnostics.detail(req.user, uuid.parse(id), parsed.version);
  }
  @Post('diagnoses') create(@Req() req: any, @Body() body: unknown) { return this.diagnostics.create(req.user, createInput.parse(body)); }
  @Patch('diagnoses/:id') save(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    return this.diagnostics.save(req.user, uuid.parse(id), saveInput.parse(body));
  }
  @Post('diagnoses/:id/publish') publish(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    return this.diagnostics.publish(req.user, uuid.parse(id), z.object({expectedVersion}).strict().parse(body).expectedVersion);
  }
  @Post('diagnoses/:id/status') changeStatus(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    return this.diagnostics.changeStatus(req.user, uuid.parse(id), z.object({expectedVersion, status: z.enum(['archived', 'active']), reason: content}).strict().parse(body));
  }
  @Post('diagnoses/:id/plans') link(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    return this.diagnostics.linkPlan(req.user, uuid.parse(id), z.object({planId: uuid, version: expectedVersion, findingId: uuid.optional()}).strict().parse(body));
  }
  @Post('diagnoses/:id/findings/:findingId/plan') createPlan(@Req() req: any, @Param('id') id: string, @Param('findingId') findingId: string, @Body() body: unknown) {
    return this.diagnostics.createPlan(req.user, uuid.parse(id), uuid.parse(findingId), createPlanInput.parse(body));
  }
}

@Module({controllers: [DiagnosticsController], providers: [DiagnosticsService], exports: [DiagnosticsService]})
export class DiagnosticsModule {}
