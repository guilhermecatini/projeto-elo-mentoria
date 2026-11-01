export type User = { id: string; name: string; email: string; role: 'admin' | 'mentor' | 'mentee' };
export type Client = { id: string; name: string; contactName?: string; email?: string; enrollmentId: string; programName: string; mentorName?: string; mentorId?: string; status: string; stage: string; startsAt?: string; endsAt: string; lastContactAt?: string; nextStep?: string; nextStepAt?: string; followupDays?: number; attentionReasons: string[] };
export type Ticket = { id: string; enrollmentId: string; clientId: string; clientName: string; mentorName?: string; subject: string; priority: 'standard' | 'urgent'; status: string; createdAt: string; firstResponseDueAt?: string; nextResponseDueAt?: string; promisedAt?: string; resolutionDueAt?: string; unansweredCount: number; messages?: Message[] };
export type Message = { id: string; body: string; kind: 'public' | 'internal' | 'automatic' | 'event'; authorId?: string; authorName: string; authorRole: string; createdAt: string; replyToId?: string; answeredAt?: string };
export type Mentor = { id: string; name: string; email: string; capacity: number; activeClients: number };
export type Program = { id: string; name: string; [key: string]: unknown };
export type Notification = { id: string; title: string; body: string; createdAt: string; acknowledgedAt?: string; ticketId?: string; taskId?: string; planId?: string; meetingId?: string; diagnosisId?: string; actionUrl?: string; enrollmentId?: string };
export type Attention = { id: string; clientId: string; enrollmentId: string; clientName: string; mentorName?: string; reason: string; dueAt?: string; ticketId?: string; planId?: string; taskId?: string; meetingId?: string; actionUrl?: string; severity: string };
export type DashboardData = { stats: { activeClients: number; waitingTickets: number; overdueTickets: number; unattendedClients: number; unassignedClients: number; clientsWithoutPlan?: number; stalledPlans?: number; overdueTasks?: number; blockedTasks?: number; pendingTaskReviews?: number; orphanTasks?: number; clientsWithoutNextMeeting?: number; overdueMeetings?: number; meetingsToday?: number; unpublishedMeetingMinutes?: number; orphanMeetings?: number }; attention: Attention[]; portfolio: Client[] };
export class ApiError extends Error { constructor(message: string, public readonly status: number, public readonly code?: string) { super(message); this.name = 'ApiError'; } }
let csrfToken = '';
export function setCsrf(value: string) { csrfToken = value; }
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, { ...options, credentials: 'include', headers: { 'Content-Type': 'application/json', ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}), ...options.headers } });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = body.message || 'Não foi possível concluir. Tente novamente.';
    throw new ApiError(Array.isArray(message) ? message.join('. ') : message, response.status, body.code);
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}
export const post = <T,>(path: string, data: unknown) => api<T>(path, { method: 'POST', body: JSON.stringify(data) });
export const patch = <T,>(path: string, data: unknown) => api<T>(path, { method: 'PATCH', body: JSON.stringify(data) });

/** Let the browser generate the multipart boundary; JSON headers must not be used here. */
export function uploadFile<T>(path: string, file: File, options: {
  requestKey: string;
  onProgress?: (percent: number | null) => void;
  signal?: AbortSignal;
}): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const cleanup = () => options.signal?.removeEventListener('abort', abort);
    if (options.signal?.aborted) { reject(new DOMException('Envio cancelado.', 'AbortError')); return; }
    xhr.open('POST', `/api${path}`);
    xhr.withCredentials = true;
    xhr.timeout = 120_000;
    if (csrfToken) xhr.setRequestHeader('X-CSRF-Token', csrfToken);
    xhr.setRequestHeader('Idempotency-Key', options.requestKey);
    xhr.upload.onprogress = event => options.onProgress?.(event.lengthComputable ? Math.round(event.loaded / event.total * 100) : null);
    xhr.onload = () => {
      cleanup();
      let response: { message?: string | string[] } = {};
      try { response = JSON.parse(xhr.responseText); } catch { /* Proxy errors may not return JSON. */ }
      if (xhr.status >= 200 && xhr.status < 300) { resolve(response as T); return; }
      const fallback = xhr.status === 413 ? 'O arquivo excede o limite permitido de 10 MiB.' : 'Não foi possível anexar o arquivo. Tente novamente.';
      reject(new Error(Array.isArray(response.message) ? response.message.join('. ') : response.message || fallback));
    };
    xhr.onerror = () => { cleanup(); reject(new Error('A conexão foi interrompida. Seu arquivo continua selecionado para uma nova tentativa.')); };
    xhr.ontimeout = () => { cleanup(); reject(new Error('O envio demorou mais que o esperado. Confira sua conexão e tente novamente.')); };
    xhr.onabort = () => { cleanup(); reject(new DOMException('Envio cancelado.', 'AbortError')); };
    options.signal?.addEventListener('abort', abort, { once: true });
    const form = new FormData();
    form.append('file', file, file.name);
    xhr.send(form);
  });
}
