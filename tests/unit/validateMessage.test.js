// @vitest-environment node
import { validateMessage } from '../../server/socketServer.js';

describe('validateMessage', () => {
  it('returns null for non-objects', () => {
    expect(validateMessage(null)).toBe(null);
    expect(validateMessage('nope')).toBe(null);
    expect(validateMessage(123)).toBe(null);
  });

  it('validates play messages', () => {
    expect(
      validateMessage({ play: { keyId: 'k1', hz: '440', volume: '0.5' } }),
    ).toEqual({ play: { keyId: 'k1', hz: 440, volume: 0.5 } });
  });

  it('rejects out-of-range hz/volume', () => {
    expect(validateMessage({ play: { keyId: 'k1', hz: 10, volume: 0.5 } })).toBe(null);
    expect(validateMessage({ play: { keyId: 'k1', hz: 440, volume: 2 } })).toBe(null);
  });

  it('truncates keyId', () => {
    const keyId = 'a'.repeat(150);
    const res = validateMessage({ play: { keyId, hz: 440, volume: 0.5 } });
    expect(res.play.keyId.length).toBe(100);
  });

  it('accepts stop messages', () => {
    expect(validateMessage({ stop: { keyId: 'k1' } })).toEqual({ stop: { keyId: 'k1' } });
  });

  it('accepts sustain messages', () => {
    expect(validateMessage({ sustain: { keyId: 'k1', hz: 440, volume: 0.5 } })).toEqual({
      sustain: { keyId: 'k1', hz: 440, volume: 0.5 },
    });
  });
});
