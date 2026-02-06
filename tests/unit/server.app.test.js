// @vitest-environment node
import request from 'supertest';
import { createApp } from '../../server/createApp.js';

describe('server app', () => {
  it('GET /health returns ok', async () => {
    const app = createApp({ nodeEnv: 'test' });

    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.type).toMatch(/json/);
    expect(res.body).toEqual(
      expect.objectContaining({
        status: 'ok',
        uptime: expect.any(Number),
      }),
    );
  });

  it('unknown routes return 404', async () => {
    const app = createApp({ nodeEnv: 'test' });

    const res = await request(app).get('/definitely-not-a-real-route');

    expect(res.status).toBe(404);
    expect(res.text).toContain('404 - File not found');
  });
});
