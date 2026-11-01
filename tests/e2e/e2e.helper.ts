import crypto from 'node:crypto';

export const TINY_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
export const SAMPLE_CSV = 'id,nombre,valor\n1,Producto Alpha,100\n2,Producto Beta,200\n';

export function buildMultipart(filename: string, content: Buffer | string, mimetype: string, fields?: Record<string, string>) {
  const boundary = `----WebKitFormBoundary${crypto.randomBytes(8).toString('hex')}`;
  const parts: (string | Buffer)[] = [];
  if (fields) {
    for (const [key, val] of Object.entries(fields)) {
      parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${val}\r\n`);
    }
  }
  parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimetype}\r\n\r\n`);
  parts.push(typeof content === 'string' ? Buffer.from(content) : content);
  parts.push(`\r\n--${boundary}--\r\n`);
  return {
    payload: Buffer.concat(parts.map((p) => (typeof p === 'string' ? Buffer.from(p) : p))),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

export type { InMemoryDb } from '../../src/scripts/in-memory-db.js';
export { setupInMemoryE2EDb } from '../../src/scripts/in-memory-db.js';

