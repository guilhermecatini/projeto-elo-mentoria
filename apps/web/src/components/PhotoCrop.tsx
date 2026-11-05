import {useEffect, useRef, useState} from 'react';
import {Check, LoaderCircle, RotateCcw, ZoomIn, ZoomOut} from 'lucide-react';
import {Dialog, useDialogDismiss} from './ui/dialog';
import {Button} from './ui/button';
import {centeredCrop, cropRectangle, exportCroppedPhoto, moveCrop, type CropPosition} from '../lib/photo-crop';

export type CropSource = {file: File; width: number; height: number; position?: CropPosition};
export function PhotoCrop({source, onClose, onApply}: {source: CropSource; onClose: () => void; onApply: (file: File, position: CropPosition) => void}) {
  const [position, setPosition] = useState(source.position || centeredCrop);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const drag = useRef<{id: number; x: number; y: number} | null>(null);
  const alive = useRef(true);
  const cancelled = useRef(false);
  const {open, dismiss} = useDialogDismiss(onClose);
  function cancel() { cancelled.current = true; dismiss(); }
  useEffect(() => { const value = URL.createObjectURL(source.file); setUrl(value); return () => URL.revokeObjectURL(value); }, [source.file]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const rect = cropRectangle(source.width, source.height, position);
  function zoom(value: number) { setPosition(previous => ({...previous, zoom: Math.max(1, Math.min(4, value))})); }
  async function apply() {
    if (busy) return;
    setBusy(true); setError('');
    try { const file = await exportCroppedPhoto(source.file, position); if (alive.current && !cancelled.current) { onApply(file, position); dismiss(); } }
    catch (failure) { if (alive.current) setError(failure instanceof Error ? failure.message : 'Não foi possível recortar a foto.'); }
    finally { if (alive.current) setBusy(false); }
  }
  return <Dialog open={open} onOpenChange={value => { if (!value) cancel(); }} title="Ajustar foto do perfil" description="Arraste a foto e ajuste o zoom. O círculo mostra como ela aparecerá no seu perfil e nas conversas.">
    <div className="photo-crop">
      <div className="photo-crop-frame" role="group" aria-label="Posição da foto" aria-describedby="photo-crop-hint" tabIndex={0}
        onPointerDown={event => { if (busy || event.button !== 0) return; event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId); drag.current = {id: event.pointerId, x: event.clientX, y: event.clientY}; }}
        onPointerMove={event => { const previous = drag.current; if (!previous || previous.id !== event.pointerId) return; const dx = event.clientX - previous.x, dy = event.clientY - previous.y; const size = event.currentTarget.clientWidth; drag.current = {...previous, x: event.clientX, y: event.clientY}; setPosition(value => moveCrop(source.width, source.height, value, dx, dy, size)); }}
        onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}
        onKeyDown={event => { const direction: Record<string, [number, number]> = {ArrowLeft: [-8, 0], ArrowRight: [8, 0], ArrowUp: [0, -8], ArrowDown: [0, 8]}; if (!busy && direction[event.key]) { event.preventDefault(); const [dx, dy] = direction[event.key]; const size = event.currentTarget.clientWidth; setPosition(value => moveCrop(source.width, source.height, value, dx, dy, size)); } }}>
        {url && <img src={url} alt="Prévia do recorte da sua foto" draggable={false} style={{width: `${source.width / rect.side * 100}%`, height: `${source.height / rect.side * 100}%`, left: `${-rect.x / rect.side * 100}%`, top: `${-rect.y / rect.side * 100}%`}} />}
        <span className="photo-crop-mask" aria-hidden="true" />
      </div>
      <p id="photo-crop-hint">Arraste para posicionar ou use as setas do teclado.</p>
      <fieldset disabled={busy} className="photo-crop-settings"><label htmlFor="photo-crop-zoom">Zoom <output>{position.zoom.toFixed(1)}×</output></label><div className="photo-crop-zoom"><button type="button" aria-label="Diminuir zoom" disabled={position.zoom <= 1} onClick={() => zoom(position.zoom - .1)}><ZoomOut size={19} /></button><input id="photo-crop-zoom" type="range" min={1} max={4} step={.01} value={position.zoom} onChange={event => zoom(Number(event.target.value))} /><button type="button" aria-label="Aumentar zoom" disabled={position.zoom >= 4} onClick={() => zoom(position.zoom + .1)}><ZoomIn size={19} /></button></div><button type="button" className="text-button" onClick={() => setPosition(centeredCrop)}><RotateCcw size={14} />Centralizar e redefinir zoom</button></fieldset>
      {error && <div role="alert" className="error-box">{error}</div>}
      <div className="photo-crop-actions"><Button variant="outline" onClick={cancel}>Cancelar</Button><Button onClick={apply} disabled={busy}>{busy ? <LoaderCircle className="spin" /> : <Check />}Usar este recorte</Button></div>
    </div>
  </Dialog>;
}
