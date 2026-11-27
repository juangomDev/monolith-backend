import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { NotificationsSseManager } from '../../../src/modules/notifications/notifications.sse.js';

describe('Módulo Notificaciones SSE: Propagación de cabeceras CORS en reply.raw', () => {
  let manager: NotificationsSseManager | null = null;

  afterEach(() => {
    manager?.teardown();
    manager = null;
  });

  it('copia cabeceras preparadas por Fastify (@fastify/cors) a reply.raw antes de flushHeaders()', () => {
    manager = new NotificationsSseManager();
    const rawHeaders = new Map<string, string | number | readonly string[]>();
    const writtenChunks: string[] = [];
    let flushed = false;
    let headersAtFlush: Record<string, unknown> = {};

    const reqEmitter = new EventEmitter();
    const fakeReply = {
      getHeaders: () => ({
        'access-control-allow-origin': 'http://localhost:5173',
        'access-control-allow-credentials': 'true',
        vary: 'Origin',
      }),
      raw: {
        setHeader(name: string, value: string | number | readonly string[]) {
          rawHeaders.set(name.toLowerCase(), value);
        },
        flushHeaders() {
          flushed = true;
          headersAtFlush = Object.fromEntries(rawHeaders.entries());
        },
        write(chunk: string) {
          writtenChunks.push(chunk);
        },
        end() {},
      },
    };

    manager.registerClient('user-1', { raw: reqEmitter } as any, fakeReply as any);

    assert.strictEqual(flushed, true);
    assert.strictEqual(headersAtFlush['access-control-allow-origin'], 'http://localhost:5173');
    assert.strictEqual(headersAtFlush['access-control-allow-credentials'], 'true');
    assert.strictEqual(headersAtFlush['vary'], 'Origin');
    assert.strictEqual(headersAtFlush['content-type'], 'text/event-stream');
    assert.strictEqual(headersAtFlush['x-accel-buffering'], 'no');
    assert.ok(writtenChunks.includes(': sse-connected\n\n'));

    reqEmitter.emit('close');
    assert.strictEqual(manager.getConnectedCount(), 0);
  });

  it('funciona limpiamente cuando reply.getHeaders() no contiene cabeceras CORS', () => {
    manager = new NotificationsSseManager();
    const rawHeaders = new Map<string, string | number | readonly string[]>();

    const reqEmitter = new EventEmitter();
    const fakeReply = {
      getHeaders: () => ({}),
      raw: {
        setHeader(name: string, value: string | number | readonly string[]) {
          rawHeaders.set(name.toLowerCase(), value);
        },
        flushHeaders() {},
        write() {},
        end() {},
      },
    };

    manager.registerClient('user-2', { raw: reqEmitter } as any, fakeReply as any);

    assert.strictEqual(rawHeaders.get('content-type'), 'text/event-stream');
    assert.strictEqual(rawHeaders.get('access-control-allow-origin'), undefined);

    reqEmitter.emit('close');
  });
});
