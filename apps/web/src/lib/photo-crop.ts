export type CropPosition = {zoom: number; x: number; y: number};
export const centeredCrop: CropPosition = {zoom: 1, x: 50, y: 50};
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Coordinates are in the oriented source image, shared by the preview and export. */
export function cropRectangle(width: number, height: number, position: CropPosition) {
  const side = Math.min(width, height) / clamp(position.zoom, 1, 4);
  return {x: (width - side) * clamp(position.x, 0, 100) / 100, y: (height - side) * clamp(position.y, 0, 100) / 100, side};
}

export function moveCrop(width: number, height: number, position: CropPosition, dx: number, dy: number, frame: number): CropPosition {
  const {side} = cropRectangle(width, height, position);
  return {...position,
    x: width === side ? 50 : clamp(position.x - dx / frame * side / (width - side) * 100, 0, 100),
    y: height === side ? 50 : clamp(position.y - dy / frame * side / (height - side) * 100, 0, 100)};
}

export async function exportCroppedPhoto(file: File, position: CropPosition): Promise<File> {
  const image = await createImageBitmap(file);
  try {
    const {x, y, side} = cropRectangle(image.width, image.height, position);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = Math.min(512, Math.max(1, Math.round(side)));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Não foi possível preparar a foto. Tente em outro navegador.');
    context.drawImage(image, x, y, side, side, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', .9));
    if (!blob || blob.type !== 'image/webp') throw new Error('Não foi possível recortar a foto neste navegador.');
    return new File([blob], 'perfil.webp', {type: 'image/webp'});
  } finally { image.close(); }
}
