import dotenv from 'dotenv';
import path from 'path';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { createApp } from './server/createApp.js';
import { attachSocketServer } from './server/socketServer.js';

dotenv.config();

// Configuration
const PORT = process.env.PORT || 666;
const NODE_ENV = process.env.NODE_ENV || 'development';
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:666';

const app = createApp({ nodeEnv: NODE_ENV, corsOrigin: CORS_ORIGIN });
const httpServer = createServer(app);
attachSocketServer(httpServer, { corsOrigin: CORS_ORIGIN });

const __filename = fileURLToPath(import.meta.url);
const isMain = Boolean(process.argv[1]) && path.resolve(process.argv[1]) === __filename;

// Start server only when run directly (not when imported)
if (isMain) {
  httpServer.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════╗
║   Endsound Server                      ║
╠════════════════════════════════════════╣
║   Environment: ${NODE_ENV.padEnd(24)} ║
║   Port:        ${PORT.toString().padEnd(24)} ║
║   URL:         http://localhost:${PORT.toString().padEnd(7)}║
╚════════════════════════════════════════╝
  `);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    httpServer.close(() => {
      console.log('HTTP server closed');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    console.log('SIGINT signal received: closing HTTP server');
    httpServer.close(() => {
      console.log('HTTP server closed');
      process.exit(0);
    });
  });
}

export { app, httpServer, PORT, NODE_ENV, CORS_ORIGIN };
