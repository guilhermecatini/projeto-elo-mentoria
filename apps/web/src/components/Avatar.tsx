import {useState} from 'react';

export function Avatar({name = '?', small = false, src}: {name?: string; small?: boolean; src?: string | null}) {
  const [failed, setFailed] = useState('');
  const initials = name.split(' ').filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  return <span className={`avatar ${small ? 'small' : ''}`}>
    {src && failed !== src ? <img src={src} alt="" loading="lazy" onError={() => setFailed(src)} /> : initials}
  </span>;
}

export function PersonName({name, src, fallback = 'Equipe'}: {name?: string | null; src?: string | null; fallback?: string}) {
  if (!name) return <>{fallback}</>;
  return <span className="person-name"><Avatar name={name} src={src} small /><span className="person-name-label">{name}</span></span>;
}
