import type { FastifyReply, FastifyRequest } from 'fastify';

export class NotificationsSseManager {
  private clients: Map<string, Set<FastifyReply>> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Heartbeat cada 25s para mantener vivas las conexiones a través de proxies y NATs
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, 25000);
    if (this.heartbeatInterval.unref) {
      this.heartbeatInterval.unref();
    }
  }

  registerClient(userId: string, request: FastifyRequest, reply: FastifyReply): void {
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('X-Accel-Buffering', 'no'); // Desactiva buffering en Nginx/Dokploy
    reply.raw.flushHeaders();

    // Handshake inicial
    reply.raw.write(': sse-connected\n\n');

    if (!this.clients.has(userId)) {
      this.clients.set(userId, new Set());
    }
    const userClients = this.clients.get(userId)!;
    userClients.add(reply);

    const cleanup = () => {
      const set = this.clients.get(userId);
      if (set) {
        set.delete(reply);
        if (set.size === 0) {
          this.clients.delete(userId);
        }
      }
    };

    request.raw.on('close', cleanup);
    request.raw.on('error', cleanup);
  }

  sendToUser(userId: string, eventName: string, data: any): boolean {
    const userClients = this.clients.get(userId);
    if (!userClients || userClients.size === 0) return false;

    const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of userClients) {
      try {
        client.raw.write(payload);
      } catch (err) {
        // En caso de socket roto, se limpiará en el evento 'close'
      }
    }
    return true;
  }

  broadcast(eventName: string, data: any): void {
    const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const set of this.clients.values()) {
      for (const client of set) {
        try {
          client.raw.write(payload);
        } catch {
          // Ignorar sockets caídos
        }
      }
    }
  }

  getConnectedCount(): number {
    let count = 0;
    for (const set of this.clients.values()) {
      count += set.size;
    }
    return count;
  }

  private sendHeartbeat(): void {
    for (const set of this.clients.values()) {
      for (const client of set) {
        try {
          client.raw.write(': ping\n\n');
        } catch {
          // Ignorar sockets caídos
        }
      }
    }
  }

  teardown(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    for (const set of this.clients.values()) {
      for (const client of set) {
        try {
          client.raw.end();
        } catch {}
      }
    }
    this.clients.clear();
  }
}

export const notificationsSse = new NotificationsSseManager();

