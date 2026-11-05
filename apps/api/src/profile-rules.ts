import {BadRequestException} from '@nestjs/common';
import {extname} from 'node:path';
import sharp from 'sharp';
import {z} from 'zod';

const version = z.number().int().positive();
const password = z.string().min(1).max(128);
const otp = z.string().regex(/^\d{6}$/).optional();
export const profileInput = z.object({
  expectedVersion: version,
  name: z.string().trim().min(2).max(120).refine(value => !/[\p{Cc}\p{Cf}]/u.test(value)),
  phone: z.string().trim().max(30).refine(value => !value || (/^[+\d\s().-]+$/.test(value) && value.replace(/\D/g, '').length >= 8 && value.replace(/\D/g, '').length <= 15)),
}).strict();
export const profileEmailInput = z.object({expectedVersion: version, email: z.email().max(254).transform(value => value.toLowerCase()), currentPassword: password, otp}).strict();
export const profilePasswordInput = z.object({currentPassword: password, newPassword: z.string().min(12).max(128), confirmPassword: z.string().min(12).max(128), otp}).strict()
  .refine(value => value.newPassword === value.confirmPassword, {message: 'As novas senhas precisam ser iguais.', path: ['confirmPassword']})
  .refine(value => value.newPassword !== value.currentPassword, {message: 'Escolha uma senha diferente da atual.', path: ['newPassword']});
export const avatarVersionInput = z.coerce.number().int().min(0).max(2147483646);
export const avatarMaxBytes = 2 * 1024 * 1024;
export type AvatarUpload = {buffer: Buffer; originalname: string; mimetype: string; size: number};

/** Decode pixels and re-encode: never serve the original upload or its metadata. */
export async function prepareAvatar(file: AvatarUpload | undefined): Promise<Buffer> {
  if (!file?.buffer?.length || file.size !== file.buffer.length || file.size > avatarMaxBytes) throw new BadRequestException('Escolha uma imagem de até 2 MiB.');
  const extension = extname(file.originalname).toLowerCase();
  const format = file.mimetype === 'image/png' && extension === '.png' ? 'png'
    : file.mimetype === 'image/jpeg' && ['.jpg', '.jpeg'].includes(extension) ? 'jpeg'
    : file.mimetype === 'image/webp' && extension === '.webp' ? 'webp' : '';
  const bytes = file.buffer;
  const signature = format === 'png' ? bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
    : format === 'jpeg' ? bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : format === 'webp' ? bytes.length > 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' : false;
  if (!signature) throw new BadRequestException('Use uma foto PNG, JPEG ou WEBP válida.');
  try {
    const image = sharp(bytes, {limitInputPixels: 20_000_000, failOn: 'warning'});
    const info = await image.metadata();
    if (info.format !== format || !info.width || !info.height || (info.pages || 1) !== 1 || info.width * info.height > 20_000_000) throw new Error('Imagem inválida.');
    const output = await image.rotate().resize(512, 512, {fit: 'cover', withoutEnlargement: true}).webp({quality: 85}).toBuffer();
    if (!output.length || output.length > 262144) throw new Error('Imagem excedente.');
    return output;
  } catch {
    throw new BadRequestException('Não foi possível ler a foto. Use uma imagem estática PNG, JPEG ou WEBP de até 20 megapixels.');
  }
}
