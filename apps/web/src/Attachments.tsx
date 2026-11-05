import {PersonName} from './components/Avatar';
import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, Download, FileImage, FileText, LoaderCircle, LockKeyhole, Paperclip, Upload, X } from 'lucide-react';
import { Button } from './components/ui/button';
import { api, uploadFile } from './lib/api';

type Attachment = {
  id: string;
  ticketId?: string;
  messageId?: string;
  taskId?: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  createdById: string;
  createdByName: string; createdByAvatarUrl?: string | null;
  visibility: 'public' | 'internal';
  downloadUrl: string;
};
type Scope = { kind: 'ticket'; id: string; messageId: string } | { kind: 'task'; id: string };
type Props = {
  scope: Scope;
  canUpload: boolean;
  internal?: boolean;
  lockedMessage?: string;
  notify: (message: string) => void;
};
const MAX_BYTES = 10 * 1024 * 1024;
const EXTENSIONS = new Set(['pdf', 'png', 'jpg', 'jpeg', 'webp', 'txt', 'csv']);
const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.txt,.csv';
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function sizeLabel(bytes: number) {
  return bytes >= 1024 * 1024
    ? `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(bytes / 1024 / 1024)} MiB`
    : `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(bytes / 1024)} KiB`;
}
function dateLabel(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).format(new Date(value));
}
function downloadPath(attachment: Attachment) {
  const expected = `/api/attachments/${attachment.id}/download`;
  return uuidPattern.test(attachment.id) && attachment.downloadUrl === expected ? expected : undefined;
}
function validateFile(file: File) {
  if (!file.size) return 'O arquivo está vazio. Escolha um arquivo com conteúdo.';
  if (file.size > MAX_BYTES) return 'O arquivo excede 10 MiB. Escolha um arquivo menor.';
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  if (!EXTENSIONS.has(extension)) return 'Formato não aceito. Escolha PDF, PNG, JPG, WEBP, TXT ou CSV.';
  return '';
}
function newRequestKey() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Files stay bound to an already-authorized message or task; uploads never create a reply or delivery. */
export function Attachments({ scope, canUpload, internal = false, lockedMessage, notify }: Props) {
  const isTask = scope.kind === 'task';
  const listPath = isTask ? `/tasks/${scope.id}/attachments` : `/tickets/${scope.id}/attachments`;
  const uploadPath = isTask ? `/tasks/${scope.id}/attachments` : `/tickets/${scope.id}/messages/${scope.messageId}/attachments`;
  const queryKey = ['attachments', scope.kind, scope.id];
  const query = useQuery({ queryKey, queryFn: () => api<Attachment[]>(listPath), refetchInterval: 30_000 });
  const queryClient = useQueryClient();
  const inputId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const [file, setFile] = useState<File | null>(null);
  const [requestKey, setRequestKey] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; activeRequest.current?.abort(); };
  }, []);

  const rows = query.isError ? [] : (query.data || []).filter(attachment => isTask || attachment.messageId === scope.messageId);

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] || null;
    setFile(selected);
    setRequestKey(selected ? newRequestKey() : '');
    setError(selected ? validateFile(selected) : '');
    setProgress(null);
  }

  function clearFile() {
    setFile(null);
    setError('');
    setRequestKey('');
    setProgress(null);
    if (fileInput.current) fileInput.current.value = '';
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || busy || !canUpload) return;
    const validation = validateFile(file);
    if (validation) { setError(validation); return; }
    const controller = new AbortController();
    activeRequest.current = controller;
    setBusy(true);
    setError('');
    setProgress(null);
    try {
      const saved = await uploadFile<Attachment>(uploadPath, file, {
        requestKey,
        signal: controller.signal,
        onProgress: percent => { if (mounted.current) setProgress(percent); },
      });
      if (!saved.id) throw new Error('Não foi possível confirmar o arquivo. Tente novamente para conferir o envio.');
      await queryClient.invalidateQueries({ queryKey });
      if (!mounted.current) return;
      clearFile();
      setUploadOpen(false);
      notify(internal ? 'Arquivo anexado à nota interna.' : 'Arquivo anexado com sucesso.');
    } catch (err) {
      if (mounted.current && !(err instanceof DOMException && err.name === 'AbortError')) {
        setError(err instanceof Error ? err.message : 'Não foi possível anexar o arquivo. Tente novamente.');
      }
    } finally {
      if (mounted.current) setBusy(false);
      activeRequest.current = null;
    }
  }

  if (!isTask && !canUpload && !query.isPending && !query.error && rows.length === 0) return null;

  return <section className={`attachments ${isTask ? 'task-attachments' : 'message-attachments'} ${internal ? 'internal-attachments' : ''}`} aria-label={internal ? 'Arquivos da nota interna' : isTask ? 'Arquivos da evidência' : 'Arquivos da mensagem'}>
    <div className="attachments-heading">
      <span><Paperclip size={15} />{isTask ? 'Arquivos da evidência' : 'Arquivos da mensagem'}{rows.length > 0 && <span className="attachment-count">{rows.length}</span>}</span>
      {internal && <span className="attachment-visibility"><LockKeyhole size={12} />Somente a equipe</span>}
      {canUpload && !query.isError && !uploadOpen && <button className="attachment-add" type="button" onClick={() => setUploadOpen(true)}><Upload size={13} />Adicionar arquivo</button>}
    </div>
    {query.isPending && <div className="attachment-loading" role="status"><LoaderCircle size={14} className="spin" />Carregando arquivos…</div>}
    {query.error && <div className="attachment-error" role="alert"><CircleAlert size={15} /><span>{query.error instanceof Error ? query.error.message : 'Não foi possível carregar os arquivos.'}</span><button type="button" onClick={() => query.refetch()}>Tentar novamente</button></div>}
    {!query.isPending && !query.error && rows.length === 0 && <p className="attachments-empty">{isTask ? 'Nenhum arquivo anexado a esta tarefa.' : 'Você pode complementar esta mensagem com um arquivo.'}</p>}
    {rows.length > 0 && <ul className="attachment-list">{rows.map(attachment => {
      const href = downloadPath(attachment);
      const typeLabel = attachment.originalName.split('.').pop()?.toUpperCase() || attachment.mimeType;
      return <li className="attachment-row" key={attachment.id}>
        <span className="attachment-file-icon">{attachment.mimeType.startsWith('image/') ? <FileImage size={19} /> : <FileText size={19} />}</span>
        <div className="attachment-info"><strong title={attachment.originalName}>{attachment.originalName}</strong><span>{typeLabel} · {sizeLabel(Number(attachment.sizeBytes))}{attachment.visibility === 'internal' && <> · Nota interna</>}</span><small><PersonName name={attachment.createdByName} src={attachment.createdByAvatarUrl} fallback={'Equipe'} /> · {dateLabel(attachment.createdAt)}</small></div>
        {href ? <a className="attachment-download" href={href} download aria-label={`Baixar ${attachment.originalName}`}><Download size={16} /><span>Baixar</span></a> : <span className="attachment-unavailable">Indisponível</span>}
      </li>;
    })}</ul>}
    {canUpload && !query.isError && uploadOpen ? <form className="attachment-upload" onSubmit={send}>
      <label className="attachment-input-label" htmlFor={inputId}>{internal ? 'Adicionar arquivo à nota interna' : 'Adicionar arquivo'}</label>
      <input id={inputId} ref={fileInput} type="file" accept={ACCEPT} onChange={selectFile} disabled={busy} aria-describedby={`${inputId}-help`} className="attachment-file-input" />
      <p id={`${inputId}-help`} className="attachment-help">PDF, PNG, JPG, WEBP, TXT ou CSV · Até 10 MiB por arquivo.</p>
      {file && <div className="attachment-selection"><Paperclip size={14} /><span><strong>{file.name}</strong><small>{sizeLabel(file.size)}</small></span><button type="button" aria-label="Remover arquivo selecionado" onClick={clearFile} disabled={busy}><X size={16} /></button></div>}
      {error && <div className="attachment-error" role="alert"><CircleAlert size={15} /><span>{error}</span></div>}
      {busy && <div className="attachment-progress" role="status" aria-live="polite"><div className="attachment-progress-label"><span>{progress === 100 ? 'Validando e salvando o arquivo…' : 'Enviando arquivo…'}</span>{progress != null && <strong>{progress}%</strong>}</div>{progress != null && <progress max={100} value={progress} aria-label="Progresso do envio" />}</div>}
      <div className="attachment-upload-footer"><p>{internal ? 'Estes arquivos ficam somente com a equipe autorizada.' : isTask ? 'Depois de anexar, descreva a evidência ao enviar a entrega.' : 'O arquivo complementa esta mensagem já enviada.'}</p><div><Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => { clearFile(); setUploadOpen(false); }}>Fechar</Button><Button type="submit" size="sm" variant="outline" disabled={!file || busy || !!(file && validateFile(file))}>{busy ? <LoaderCircle className="spin" /> : <Upload />}{busy ? 'Enviando…' : error ? 'Tentar envio novamente' : 'Anexar arquivo'}</Button></div></div>
    </form> : !canUpload && isTask && lockedMessage ? <p className="attachment-locked"><LockKeyhole size={13} />{lockedMessage}</p> : null}
  </section>;
}
