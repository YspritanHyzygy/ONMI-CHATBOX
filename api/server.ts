import type { Server } from 'node:http';
import app from './app.js';
import { ensureDatabaseInitialized } from './services/database-init.js';
import { sanitizeErrorMessage } from './services/error-utils.js';

export async function startServer(): Promise<Server> {
  await ensureDatabaseInitialized();

  const port = Number(process.env.PORT || 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  const host = process.env.HOST?.trim() || '127.0.0.1';

  const server = app.listen(port, host, () => {
    console.log(`ONMI Chatbox server ready at http://${host}:${port}`);
  });

  const shutdown = (signal: string) => {
    console.log(`${signal} received; closing server`);
    server.close(() => {
      console.log('Server closed');
    });
  };

  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
  return server;
}

if (process.env.NODE_ENV !== 'test') {
  void startServer().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Server startup failed: ${sanitizeErrorMessage(message)}`);
    process.exitCode = 1;
  });
}

export default app;
