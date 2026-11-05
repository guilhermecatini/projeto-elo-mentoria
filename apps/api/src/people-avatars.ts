import {CallHandler, Controller, ExecutionContext, Get, Injectable, Module, NestInterceptor, NotFoundException, Param, Query, Req, Res} from '@nestjs/common';
import {APP_INTERCEPTOR} from '@nestjs/core';
import {createHmac, timingSafeEqual} from 'node:crypto';
import {mergeMap} from 'rxjs';
import {z} from 'zod';
import {admin, enrollment, scopedEnrollments, ticket} from './access';
import {User} from './auth';
import {db} from './db';

type Context = {scope: 'admin' | 'team' | 'enrollment' | 'ticket' | 'material' | 'feedback'; contextId: string};
const uuid = z.string().uuid();
const photoQuery = z.object({scope: z.enum(['admin', 'team', 'enrollment', 'ticket', 'material', 'feedback']), contextId: z.union([uuid, z.literal('directory')]), v: z.coerce.number().int().nonnegative(), sig: z.string().regex(/^[a-f0-9]{64}$/)}).strict();
function signature(viewer: User, target: string, context: Context, version: number) {
  return createHmac('sha256', process.env.SESSION_SECRET || 'local-only-development-secret')
    .update(JSON.stringify([viewer.organizationId, viewer.id, viewer.role, target, context.scope, context.contextId, version])).digest('hex');
}
function photoUrl(viewer: User, person: any, context: Context) {
  if (!person?.has_avatar) return null;
  const query = new URLSearchParams({...context, v: String(person.avatar_version), sig: signature(viewer, person.id, context, person.avatar_version)});
  return `/api/people/${person.id}/avatar?${query}`;
}

/** Recheck the original resource on every read, including portfolio handoffs. */
async function authorize(viewer: User, context: Context) {
  if (context.scope === 'admin') return admin(viewer);
  if (context.scope === 'team') { if (viewer.role === 'mentee') throw new NotFoundException(); return; }
  if (!uuid.safeParse(context.contextId).success) throw new NotFoundException();
  if (context.scope === 'enrollment') return enrollment(viewer, context.contextId);
  if (context.scope === 'ticket') return ticket(viewer, context.contextId);
  if (context.scope === 'feedback') {
    const row = await db('satisfaction_responses').where({id: context.contextId, organization_id: viewer.organizationId}).first();
    if (!row || (viewer.role === 'mentor' && !row.shared_with_mentor) || (viewer.role === 'mentee' && row.respondent_id !== viewer.id)) throw new NotFoundException();
    return enrollment(viewer, row.enrollment_id);
  }
  const query = db('documents as d').where({'d.id': context.contextId, 'd.organization_id': viewer.organizationId});
  if (viewer.role === 'mentor') query.whereNot('d.visibility', 'admin_private').where(function () { this.whereNull('d.enrollment_id').orWhereIn('d.enrollment_id', scopedEnrollments(viewer).select('e.id')); });
  if (viewer.role === 'mentee') query.where({'d.visibility': 'shared', 'd.status': 'published'}).where('d.published_version', '>', 0).whereIn('d.enrollment_id', scopedEnrollments(viewer).select('e.id'));
  if (!await query.first()) throw new NotFoundException();
}

@Controller('api/people')
class PeopleAvatarsController {
  @Get(':id/avatar') async photo(@Req() req: any, @Param('id') id: string, @Query() input: unknown, @Res() res: any) {
    uuid.parse(id);
    const query = photoQuery.parse(input);
    const expected = signature(req.user, id, query, query.v);
    if (!timingSafeEqual(Buffer.from(expected), Buffer.from(query.sig))) throw new NotFoundException('Foto não encontrada.');
    await authorize(req.user, query);
    const image = await db('user_avatars as a').join('users as u', 'u.id', 'a.user_id')
      .where({'a.user_id': id, 'a.organization_id': req.user.organizationId, 'u.organization_id': req.user.organizationId, 'u.has_avatar': true, 'u.avatar_version': query.v}).select('a.body').first();
    if (!image) throw new NotFoundException('Foto não encontrada.');
    res.set({'Content-Type': 'image/webp', 'Cache-Control': 'private, no-store', 'Content-Disposition': 'inline; filename="perfil.webp"', 'X-Content-Type-Options': 'nosniff'}).send(image.body);
  }
}

const pairs = ['author', 'actor', 'mentor', 'assignee', 'owner', 'createdBy', 'respondent', 'host', 'coverage'] as const;
// Only server-owned DTO collections. Never interpret user-supplied drafts, audit details or rich content as identities.
const collections = new Set(['messages', 'history', 'timeline', 'assignments', 'enrollments', 'portfolio', 'followupQueue', 'attention', 'tasks', 'plans', 'participants', 'members', 'reviews', 'interventions', 'responses', 'affectedEnrollments', 'queue', 'byMentor', 'attachments', 'imports']);
const personCollections = new Set(['participants', 'members', 'byMentor']);
export async function addPeopleAvatars(viewer: User, path: string, data: any): Promise<any> {
  if (!data || typeof data !== 'object' || Buffer.isBuffer(data)) return data;
  if (!/^\/api\/(dashboard|clients|mentors|users|tickets|plans|tasks|enrollments|meetings|diagnoses|indicators|indicator-goals|journey|materials|commercial|reports|attachments)(\/|$)/.test(path) || /(?:export|download|csv|files)(?:\/|\.|$)/.test(path)) return data;
  let base: Context | undefined;
  const parts = path.split('/');
  if (parts[2] === 'users' || parts[2] === 'commercial') base = {scope: 'admin', contextId: 'directory'};
  else if (parts[2] === 'mentors' || (parts[2] === 'journey' && ['mentors', 'absences'].includes(parts[3])) || parts[2] === 'reports') base = {scope: 'team', contextId: 'directory'};
  else if (parts[2] === 'enrollments' && uuid.safeParse(parts[3]).success) base = {scope: 'enrollment', contextId: parts[3]};
  else if (parts[2] === 'tickets' && uuid.safeParse(parts[3]).success) base = {scope: 'ticket', contextId: parts[3]};
  else if (parts[2] === 'materials' && uuid.safeParse(parts[3]).success) base = {scope: 'material', contextId: parts[3]};
  else if (parts[2] === 'journey' && parts[3] === 'enrollments' && uuid.safeParse(parts[4]).success) base = {scope: 'enrollment', contextId: parts[4]};
  const rootPeople = /^\/api\/(users|mentors|journey\/mentors)(\/|$)/.test(path) || /\/(task-assignees|meeting-participants)$/.test(path);
  const entries: {object: any; field: string; id: string; context: Context}[] = [];
  function walk(value: any, inherited: Context | undefined, people = false, collection = '') {
    if (Array.isArray(value)) { for (const item of value) walk(item, inherited, people, collection); return; }
    if (!value || typeof value !== 'object') return;
    let context = inherited;
    if (inherited?.scope !== 'material' && inherited?.scope !== 'admin' && uuid.safeParse(value.enrollmentId).success) context = {scope: 'enrollment', contextId: value.enrollmentId};
    if (!context && uuid.safeParse(value.ticketId).success) context = {scope: 'ticket', contextId: value.ticketId};
    if (collection === 'responses' && parts[2] === 'journey' && parts[3] === 'satisfaction' && uuid.safeParse(value.id).success) context = {scope: 'feedback', contextId: value.id};
    if (context) {
      for (const prefix of pairs) if (typeof value[`${prefix}Name`] === 'string' && uuid.safeParse(value[`${prefix}Id`]).success) entries.push({object: value, field: `${prefix}AvatarUrl`, id: value[`${prefix}Id`], context});
      if (people && typeof value.name === 'string') {
        const id = value.userId || value.mentorId || value.id;
        if (uuid.safeParse(id).success) entries.push({object: value, field: 'avatarUrl', id, context});
      }
    }
    for (const key of collections) if (value[key]) walk(value[key], context, personCollections.has(key), key);
  }
  walk(data, base, rootPeople);
  if (!entries.length) return data;
  const people = await db('users').where({organization_id: viewer.organizationId}).whereIn('id', [...new Set(entries.map(item => item.id))]).select('id', 'has_avatar', 'avatar_version');
  const byId = new Map(people.map(person => [person.id, person]));
  for (const entry of entries) entry.object[entry.field] = photoUrl(viewer, byId.get(entry.id), entry.context);
  return data;
}

@Injectable()
class PeopleAvatarsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const req = context.switchToHttp().getRequest();
    if (req.method !== 'GET' || !req.user) return next.handle();
    return next.handle().pipe(mergeMap(data => addPeopleAvatars(req.user, req.path, data)));
  }
}
@Module({controllers: [PeopleAvatarsController], providers: [{provide: APP_INTERCEPTOR, useClass: PeopleAvatarsInterceptor}]})
export class PeopleAvatarsModule {}
