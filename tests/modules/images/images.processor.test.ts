import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { imagesProcessor } from '../../../src/modules/images/images.processor.js';
import fs from 'node:fs/promises';

describe('Módulo Imágenes: ImagesProcessor', () => {
  afterEach(() => {
    mock.reset();
  });

  it('getThumbnailPath: debe generar ruta adecuada en carpeta thumbs con extensión .webp', () => {
    const thumbPath = imagesProcessor.getThumbnailPath('codigoTest1');
    assert.ok(thumbPath.includes('thumbs'));
    assert.ok(thumbPath.endsWith('codigoTest1.webp'));
  });

  it('extractDimensions: debe retornar null en width/height de forma segura si el archivo no es procesable por Sharp', async () => {
    const dims = await imagesProcessor.extractDimensions('/ruta/inexistente/imagen.png');
    assert.strictEqual(dims.width, null);
    assert.strictEqual(dims.height, null);
  });

  it('generateThumbnail: debe retornar null de forma segura ante un archivo inválido sin lanzar excepción no capturada', async () => {
    const result = await imagesProcessor.generateThumbnail('/ruta/invalida/fake.png', 'codigoTest1');
    assert.strictEqual(result, null);
  });

  it('deleteThumbnail: debe intentar borrar la miniatura si existe en disco', async () => {
    let unlinkedPath = '';
    mock.method(fs, 'stat', async () => ({ isFile: () => true }) as any);
    mock.method(fs, 'unlink', async (p: string) => {
      unlinkedPath = p;
    });

    await imagesProcessor.deleteThumbnail('scEliminar123');
    assert.ok(unlinkedPath.includes('scEliminar123.webp'));
  });

  it('deleteThumbnail: no debe fallar si la miniatura no existe en disco', async () => {
    mock.method(fs, 'stat', async () => {
      throw new Error('ENOENT');
    });

    await assert.doesNotReject(async () => {
      await imagesProcessor.deleteThumbnail('noExiste123');
    });
  });
});
