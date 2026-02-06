// @vitest-environment node
import { io as ioClient } from 'socket.io-client';
import { startTestServer } from '../helpers/startTestServer.js';

function once(socket, event) {
  return new Promise((resolve) => socket.once(event, resolve));
}

describe('socket.io integration', () => {
  let logSpy;
  let warnSpy;
  let errorSpy;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy?.mockRestore();
    warnSpy?.mockRestore();
    errorSpy?.mockRestore();
  });

  it('sends welcome and broadcasts session:joined', async () => {
    const server = await startTestServer();

    const a = ioClient(server.url, {
      transports: ['websocket'],
      forceNew: true,
      extraHeaders: { Origin: 'http://localhost' },
    });

    const welcomeA = await once(a, 'welcome');
    expect(welcomeA).toEqual(
      expect.objectContaining({
        sessionId: expect.any(String),
        activeSessions: expect.any(Array),
        messageHistory: expect.any(Array),
      }),
    );

    const joinedPromise = once(a, 'session:joined');

    const b = ioClient(server.url, {
      transports: ['websocket'],
      forceNew: true,
      extraHeaders: { Origin: 'http://localhost' },
    });

    const welcomeB = await once(b, 'welcome');
    expect(welcomeB.activeSessions.length).toBeGreaterThanOrEqual(2);

    const joined = await joinedPromise;
    expect(joined).toEqual(
      expect.objectContaining({
        sessionId: expect.any(String),
      }),
    );

    a.disconnect();
    b.disconnect();
    await server.stop();
  });

  it('broadcasts note:play to other clients (and validates payload)', async () => {
    const server = await startTestServer();

    const a = ioClient(server.url, {
      transports: ['websocket'],
      forceNew: true,
      extraHeaders: { Origin: 'http://localhost' },
    });
    const b = ioClient(server.url, {
      transports: ['websocket'],
      forceNew: true,
      extraHeaders: { Origin: 'http://localhost' },
    });

    const welcomeA = await once(a, 'welcome');
    await once(b, 'welcome');

    const recv = once(b, 'note:play');

    a.emit('note:play', { keyId: 'k1_0', hz: 440, volume: 0.5 });

    const msg = await recv;
    expect(msg).toEqual(
      expect.objectContaining({
        type: 'note:play',
        sessionId: welcomeA.sessionId,
        timestamp: expect.any(Number),
        data: {
          keyId: 'k1_0',
          hz: 440,
          volume: 0.5,
        },
      }),
    );

    a.disconnect();
    b.disconnect();
    await server.stop();
  });
});
