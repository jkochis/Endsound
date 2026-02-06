import { createServer } from 'http';
import { createApp } from '../../server/createApp.js';
import { attachSocketServer } from '../../server/socketServer.js';

export async function startTestServer({ corsOrigin = 'http://localhost' } = {}) {
  const app = createApp({ nodeEnv: 'test', corsOrigin });
  const httpServer = createServer(app);
  const io = attachSocketServer(httpServer, { corsOrigin });

  await new Promise((resolve) => {
    httpServer.listen(0, '127.0.0.1', resolve);
  });

  const address = httpServer.address();
  const port = typeof address === 'object' && address ? address.port : null;
  if (!port) {
    throw new Error('Failed to bind test server to a port');
  }

  const url = `http://127.0.0.1:${port}`;

  async function stop() {
    await new Promise((resolve) => io.close(resolve));
    await new Promise((resolve) => httpServer.close(resolve));
  }

  return { url, port, app, httpServer, io, stop };
}
