import { buildApp } from './app.js';
import { env } from './config/env.js';
import { connectDB, disconnectDB } from './config/db.js';

async function start() {
  const app = await buildApp();

  try {
    // Conectar base de datos
    await connectDB();
    app.log.info('Conexión con PostgreSQL establecida.');

    // Arrancar listener Fastify
    await app.listen({
      port: env.PORT,
      host: env.HOST,
    });

    app.log.info(`Servidor escuchando en ${env.BASE_URL}`);
  } catch (err) {
    app.log.fatal(err, 'Fallo crítico al iniciar la aplicación');
    process.exit(1);
  }

  // Graceful Shutdown
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  for (const signal of signals) {
    process.on(signal, async () => {
      app.log.info(`Recibida señal ${signal}. Iniciando apagado controlado...`);
      try {
        await app.close();
        await disconnectDB();
        app.log.info('Servidor y conexiones cerrados exitosamente.');
        process.exit(0);
      } catch (err) {
        app.log.error(err, 'Error durante el apagado controlado');
        process.exit(1);
      }
    });
  }
}

start();
