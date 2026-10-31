import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../app.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function exportOpenApi() {
  const app = await buildApp();
  await app.ready();

  const spec = app.swagger();
  const outputPath = path.resolve(__dirname, '../../openapi.json');

  await fs.writeFile(outputPath, JSON.stringify(spec, null, 2), 'utf-8');
  console.log(`[OpenAPI] Especificación OpenAPI 3.1 exportada exitosamente en: ${outputPath}`);
  process.exit(0);
}

exportOpenApi().catch((err) => {
  console.error('[OpenAPI] Error exportando especificación:', err);
  process.exit(1);
});
