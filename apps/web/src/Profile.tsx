import {useEffect, useId, useRef, useState, type FormEvent} from 'react';
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {Camera, CheckCircle2, Eye, EyeOff, ImagePlus, KeyRound, LoaderCircle, LockKeyhole, Mail, Save, ShieldCheck, Trash2, UserRound, X} from 'lucide-react';
import {Button} from './components/ui/button';
import {Avatar} from './components/Avatar';
import {PhotoCrop, type CropSource} from './components/PhotoCrop';
import {api, patch, post, setCsrf, type User} from './lib/api';
import {useMotionRegion} from './lib/use-motion-region';
import './profile.css';

type ProfileData = User & {phone: string; version: number; avatarVersion: number; mfaEnabled: boolean; updatedAt: string | null; passwordChangedAt: string | null};
type SessionChange = {user: User; profile: ProfileData; csrfToken: string};
type Props = {user: User; onUserChange: (user: User) => void; notify: (message: string) => void};
const roles = {admin: 'Administração', mentor: 'Mentor', mentee: 'Mentorado'};

export function Profile(props: Props) {
  const query = useQuery({queryKey: ['profile', props.user.id], queryFn: () => api<ProfileData>('/profile'), refetchOnWindowFocus: false, refetchOnMount: 'always', staleTime: 0});
  if (query.isPending || (query.isFetching && !query.isFetchedAfterMount)) return <div className="loading" role="status"><LoaderCircle className="spin" />Carregando seu perfil…</div>;
  if (query.isError) return <div className="panel account-profile-error"><ErrorBox error={query.error} /><Button variant="outline" onClick={() => query.refetch()}>Tentar novamente</Button></div>;
  return <ProfileEditor key={props.user.id} {...props} initial={query.data} />;
}

function ErrorBox({error}: {error: unknown}) {
  return error ? <div role="alert" className="error-box">{error instanceof Error ? error.message : String(error)}</div> : null;
}

function PasswordField({label, name, newPassword = false, hint}: {label: string; name: string; newPassword?: boolean; hint?: string}) {
  const [visible, setVisible] = useState(false);
  const id = useId();
  return <div className="field"><label htmlFor={id}>{label}</label><div className="account-password-input"><input id={id} name={name} type={visible ? 'text' : 'password'} required minLength={newPassword ? 12 : 1} maxLength={128} autoComplete={newPassword ? 'new-password' : 'current-password'} aria-describedby={hint ? `${id}-hint` : undefined} /><button type="button" aria-label={`${visible ? 'Ocultar' : 'Mostrar'} ${label.toLowerCase()}`} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>{hint && <small id={`${id}-hint`}>{hint}</small>}</div>;
}

function OtpField({enabled}: {enabled: boolean}) {
  return enabled ? <label className="field"><span>Código do autenticador</span><input name="otp" required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="000000" /><small>Informe o código atual de seis dígitos do seu aplicativo.</small></label> : null;
}

function ProfileEditor({initial, onUserChange, notify}: Props & {initial: ProfileData}) {
  const queryClient = useQueryClient();
  const [profile, setProfile] = useState(initial);
  const [draft, setDraft] = useState({name: initial.name, phone: initial.phone, expectedVersion: initial.version});
  const [tab, setTab] = useState('personal');
  const tabMotion = useMotionRegion(tab);
  const [busy, setBusy] = useState('');
  const [errors, setErrors] = useState<Record<string, unknown>>({});
  const [file, setFile] = useState<File | null>(null);
  const [cropSource, setCropSource] = useState<CropSource | null>(null);
  const [original, setOriginal] = useState<CropSource | null>(null);
  const [preview, setPreview] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const photoRequest = useRef(0);
  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const dirty = draft.name !== profile.name || draft.phone !== profile.phone;
  function error(key: string, value: unknown) { setErrors(previous => ({...previous, [key]: value})); }
  function accept(value: ProfileData) {
    setProfile(value);
    queryClient.setQueryData(['profile', value.id], value);
    onUserChange({id: value.id, name: value.name, email: value.email, role: value.role, avatarUrl: value.avatarUrl});
    void queryClient.invalidateQueries({predicate: query => query.queryKey[0] !== 'profile'});
  }
  function resetFile() { photoRequest.current++; setFile(null); setOriginal(null); setCropSource(null); if (fileInput.current) fileInput.current.value = ''; }
  async function choosePhoto(selected?: File) {
    error('photo', null);
    const request = ++photoRequest.current;
    if (!selected) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(selected.type) || !/\.(png|jpe?g|webp)$/i.test(selected.name)) { error('photo', new Error('Escolha uma foto PNG, JPEG ou WEBP.')); return; }
    if (!selected.size || selected.size > 2 * 1024 * 1024) { error('photo', new Error('A foto deve ter no máximo 2 MB.')); return; }
    try {
      const image = await createImageBitmap(selected);
      const {width, height} = image;
      const valid = width * height <= 20_000_000; image.close();
      if (request !== photoRequest.current) return;
      if (!valid) { error('photo', new Error('Escolha uma foto de até 20 megapixels.')); return; }
      setCropSource({file: selected, width, height});
      if (fileInput.current) fileInput.current.value = '';
    } catch { if (request === photoRequest.current) error('photo', new Error('Não foi possível abrir esta foto. Escolha outra imagem.')); }
  }
  async function upload() {
    if (!file || busy) return;
    setBusy('photo'); error('photo', null);
    try {
      const data = new FormData(); data.append('file', file, file.name);
      const saved = await api<ProfileData>(`/profile/avatar?expectedVersion=${profile.avatarVersion}`, {method: 'POST', body: data});
      accept(saved); resetFile(); notify('Foto do perfil atualizada.');
    } catch (failure) { error('photo', failure); } finally { setBusy(''); }
  }
  async function removePhoto() {
    if (busy) return;
    setBusy('remove'); error('photo', null);
    try { accept(await api<ProfileData>(`/profile/avatar?expectedVersion=${profile.avatarVersion}`, {method: 'DELETE'})); resetFile(); notify('Foto removida. Suas iniciais serão exibidas.'); }
    catch (failure) { error('photo', failure); } finally { setBusy(''); }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const phone = draft.phone.trim(), digits = phone.replace(/\D/g, '');
    if (phone && (!/^[+\d\s().-]+$/.test(phone) || digits.length < 8 || digits.length > 15)) { error('personal', new Error('Informe um telefone com DDD, entre 8 e 15 dígitos, ou deixe o campo vazio.')); return; }
    setBusy('personal'); error('personal', null);
    try {
      const saved = await patch<ProfileData>('/profile', draft);
      accept(saved); setDraft({name: saved.name, phone: saved.phone, expectedVersion: saved.version}); notify('Seus dados foram atualizados.');
    } catch (failure) { error('personal', failure); } finally { setBusy(''); }
  }
  async function security(event: FormEvent<HTMLFormElement>, kind: 'email' | 'password') {
    event.preventDefault(); if (busy) return;
    const form = event.currentTarget, values = Object.fromEntries(new FormData(form));
    error(kind, null);
    if (kind === 'password' && values.newPassword !== values.confirmPassword) { error(kind, new Error('As novas senhas precisam ser iguais.')); return; }
    if (kind === 'password' && values.newPassword === values.currentPassword) { error(kind, new Error('Escolha uma senha diferente da atual.')); return; }
    setBusy(kind);
    try {
      const result = await post<SessionChange>(`/profile/${kind}`, {...values, ...(kind === 'email' ? {expectedVersion: profile.version} : {})});
      setCsrf(result.csrfToken); accept(result.profile);
      if (kind === 'email') setDraft(previous => ({...previous, expectedVersion: result.profile.version}));
      form.reset(); notify(kind === 'email' ? 'E-mail atualizado. Use o novo endereço no próximo acesso.' : 'Senha alterada. Os outros acessos foram encerrados.');
    } catch (failure) { error(kind, failure); } finally { setBusy(''); }
  }
  async function reload() {
    if (busy) return;
    setBusy('reload'); error('personal', null);
    try { const latest = await api<ProfileData>('/profile'); accept(latest); setDraft({name: latest.name, phone: latest.phone, expectedVersion: latest.version}); notify('Dados do perfil recarregados.'); }
    catch (failure) { error('personal', failure); } finally { setBusy(''); }
  }
  return <div className="account-profile">
    <div className="page-title"><div><span className="eyebrow">SEU ESPAÇO, DO SEU JEITO</span><h1>Meu perfil</h1><p>Cuide dos seus dados, da sua foto e da segurança do seu acesso.</p></div><span className="account-private"><LockKeyhole size={15} />Sua conta pessoal</span></div>
    <div className="account-layout">
      <aside className="panel account-identity"><div className="account-identity-banner" /><div className="account-picture"><Avatar name={profile.name} src={preview || profile.avatarUrl} /><span aria-hidden="true"><Camera size={17} /></span></div><h2>{profile.name}</h2><p className="account-email">{profile.email}</p><span className="badge green">{roles[profile.role]}</span>
        <div className="account-photo-controls"><input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" aria-label="Escolher foto do perfil" className="sr-only" tabIndex={-1} onChange={event => void choosePhoto(event.target.files?.[0])} disabled={!!busy} /><Button variant="outline" onClick={() => fileInput.current?.click()} disabled={!!busy}><ImagePlus size={16} />{profile.avatarUrl ? 'Escolher outra foto' : 'Adicionar foto'}</Button><p>PNG, JPEG ou WEBP · Até 2 MB.<br />Ajuste a posição e o zoom antes de salvar.</p>
          {file && <div className="account-photo-preview"><span>Recorte pronto para salvar</span><button className="text-button" onClick={() => setCropSource(original)} disabled={!!busy}>Reajustar recorte</button><Button onClick={upload} disabled={!!busy}>{busy === 'photo' ? <LoaderCircle className="spin" /> : <CheckCircle2 />}Salvar foto</Button><button className="text-button" onClick={resetFile} disabled={!!busy}><X size={14} />Descartar seleção</button></div>}
          {profile.avatarUrl && !file && <button className="text-button account-remove-photo" onClick={removePhoto} disabled={!!busy}>{busy === 'remove' ? <LoaderCircle size={14} className="spin" /> : <Trash2 size={14} />}Remover foto</button>}<ErrorBox error={errors.photo} />
        </div><div className="account-identity-note"><ShieldCheck size={19} /><p>Seus vínculos e permissões são gerenciados pela administração da mentoria.</p></div>
      </aside>
      <section className="panel account-content" ref={tabMotion}><div className="tabs account-tabs" role="tablist" aria-label="Seções do perfil"><button id="profile-personal-tab" role="tab" aria-selected={tab === 'personal'} aria-controls="profile-personal-panel" tabIndex={tab === 'personal' ? 0 : -1} className={tab === 'personal' ? 'selected' : ''} onClick={() => setTab('personal')} onKeyDown={event => { if (['ArrowRight', 'ArrowLeft', 'End'].includes(event.key)) { event.preventDefault(); setTab('security'); document.getElementById('profile-security-tab')?.focus(); } }}><UserRound size={16} />Dados pessoais</button><button id="profile-security-tab" role="tab" aria-selected={tab === 'security'} aria-controls="profile-security-panel" tabIndex={tab === 'security' ? 0 : -1} className={tab === 'security' ? 'selected' : ''} onClick={() => setTab('security')} onKeyDown={event => { if (['ArrowRight', 'ArrowLeft', 'Home'].includes(event.key)) { event.preventDefault(); setTab('personal'); document.getElementById('profile-personal-tab')?.focus(); } }}><KeyRound size={16} />Segurança</button></div>
        <div id="profile-personal-panel" role="tabpanel" aria-labelledby="profile-personal-tab" hidden={tab !== 'personal'} className="account-tab-content"><div className="account-section-title"><h2>Como você quer ser chamado?</h2><p>Mantenha suas informações pessoais atualizadas.</p></div><form className="form-stack" onSubmit={save} aria-busy={busy === 'personal'}><fieldset disabled={!!busy}><label className="field"><span>Nome completo</span><input name="name" required minLength={2} maxLength={120} autoComplete="name" value={draft.name} onChange={event => setDraft(previous => ({...previous, name: event.target.value}))} /></label><label className="field"><span>Telefone (opcional)</span><input name="phone" type="tel" maxLength={30} autoComplete="tel" placeholder="(11) 99999-9999" value={draft.phone} onChange={event => setDraft(previous => ({...previous, phone: event.target.value}))} /><small>Inclua o DDD. O preenchimento não ativa notificações por telefone.</small></label><label className="field"><span>E-mail de acesso</span><input type="email" value={profile.email} readOnly /><small>Para alterar seu e-mail, abra a aba Segurança.</small></label></fieldset><ErrorBox error={errors.personal} /><div className="account-form-actions"><Button disabled={!!busy || !dirty}>{busy === 'personal' ? <LoaderCircle className="spin" /> : <Save />}Salvar alterações</Button><button type="button" className="text-button" onClick={reload} disabled={!!busy}>{dirty ? 'Descartar alterações e recarregar' : 'Recarregar dados'}</button></div></form></div>
        <div id="profile-security-panel" role="tabpanel" aria-labelledby="profile-security-tab" hidden={tab !== 'security'} className="account-tab-content"><div className="account-security-status"><ShieldCheck size={21} /><div><strong>{profile.mfaEnabled ? 'Autenticação em duas etapas ativa' : 'Acesso protegido por senha'}</strong><p>{profile.mfaEnabled ? 'Seu autenticador também será solicitado nas alterações de acesso.' : 'Use uma senha exclusiva para sua conta.'}</p></div></div>
          <section className="account-security-section"><div className="account-section-title"><h2><KeyRound size={19} />Alterar senha</h2><p>Ao salvar, os outros acessos e links de recuperação anteriores serão encerrados. Este dispositivo continuará conectado.</p></div><form className="form-stack" onSubmit={event => void security(event, 'password')} aria-busy={busy === 'password'}><fieldset disabled={!!busy}><PasswordField label="Senha atual" name="currentPassword" /><PasswordField label="Nova senha" name="newPassword" newPassword hint="Use pelo menos 12 caracteres. Máximo de 128." /><PasswordField label="Confirme a nova senha" name="confirmPassword" newPassword /><OtpField enabled={profile.mfaEnabled} /></fieldset><ErrorBox error={errors.password} /><Button disabled={!!busy}>{busy === 'password' ? <LoaderCircle className="spin" /> : <KeyRound />}Alterar senha</Button></form>{profile.passwordChangedAt && <p className="account-last-change">Última alteração em {new Date(profile.passwordChangedAt).toLocaleString('pt-BR', {timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short'})}.</p>}</section>
          <section className="account-security-section"><div className="account-section-title"><h2><Mail size={19} />Alterar e-mail de acesso</h2><p>Atual: <strong>{profile.email}</strong>. Confira o novo endereço: ele será usado para entrar no Elo. Os outros acessos também serão encerrados.</p></div><form className="form-stack" onSubmit={event => void security(event, 'email')} aria-busy={busy === 'email'}><fieldset disabled={!!busy}><label className="field"><span>Novo e-mail de acesso</span><input name="email" type="email" required maxLength={254} autoComplete="email" /></label><PasswordField label="Senha atual para alterar o e-mail" name="currentPassword" /><OtpField enabled={profile.mfaEnabled} /></fieldset><ErrorBox error={errors.email} /><Button variant="outline" disabled={!!busy}>{busy === 'email' ? <LoaderCircle className="spin" /> : <Mail />}Atualizar e-mail</Button></form></section>
        </div>
      </section>
    </div>
    {cropSource && <PhotoCrop source={cropSource} onClose={() => setCropSource(null)} onApply={(cropped, position) => { setFile(cropped); setOriginal({...cropSource, position}); }} />}
  </div>;
}
