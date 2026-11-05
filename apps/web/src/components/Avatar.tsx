import {useState} from 'react';

export function Avatar({name = '?', small = false, src}: {name?: string; small?: boolean; src?: string | null}) {
  const [failed, setFailed] = useState('');
  const initials = name.split(' ').filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  return <span className={`avatar ${small ? 'small' : ''}`}>
    {src && failed !== src ? <img src={src} alt="" onError={() => setFailed(src)} /> : initials}
  </span>;
}
