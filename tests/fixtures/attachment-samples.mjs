// Tiny deterministic documents used only by the private attachment integration tests.
export const textBytes = Buffer.from('Memória do kit: receita R$ 80; custo R$ 60; margem R$ 20.\n', 'utf8');
export const csvBytes = Buffer.from('sku;receita;custo\nKIT-1;80;60\n', 'utf8');
export const pngBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1ioAAAAASUVORK5CYII=', 'base64');
const pdfObjects = ['1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n', '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n', '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Contents 4 0 R >>\nendobj\n', '4 0 obj\n<< /Length 0 >>\nstream\n\nendstream\nendobj\n'];
let pdf = '%PDF-1.4\n';
const offsets = [0];
for (const object of pdfObjects) { offsets.push(Buffer.byteLength(pdf)); pdf += object; }
const xrefOffset = Buffer.byteLength(pdf);
pdf += `xref\n0 5\n0000000000 65535 f \n${offsets.slice(1).map(value => String(value).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
export const pdfBytes = Buffer.from(pdf);
