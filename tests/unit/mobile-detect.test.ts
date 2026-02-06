import { getOrientation, isTouchDevice, onOrientationChange } from '../../src/mobile-detect';

describe('mobile-detect', () => {
  it('isTouchDevice detects touch via ontouchstart', () => {
    // Ensure property exists on window
    (window as any).ontouchstart = null;

    expect(isTouchDevice()).toBe(true);

    // Cleanup
    delete (window as any).ontouchstart;
  });

  it('isTouchDevice detects touch via maxTouchPoints', () => {
    Object.defineProperty(navigator, 'maxTouchPoints', {
      value: 2,
      configurable: true,
    });

    expect(isTouchDevice()).toBe(true);

    Object.defineProperty(navigator, 'maxTouchPoints', {
      value: 0,
      configurable: true,
    });
  });

  it('getOrientation returns portrait/landscape based on matchMedia', () => {
    const original = window.matchMedia;

    window.matchMedia = ((query: string) => ({
      matches: query.includes('portrait'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as any;

    expect(getOrientation()).toBe('portrait');

    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as any;

    expect(getOrientation()).toBe('landscape');

    window.matchMedia = original;
  });

  it('onOrientationChange registers handlers and returns cleanup', () => {
    const addWindowSpy = vi.spyOn(window, 'addEventListener');
    const removeWindowSpy = vi.spyOn(window, 'removeEventListener');

    const addMqlSpy = vi.fn();
    const removeMqlSpy = vi.fn();

    const original = window.matchMedia;
    window.matchMedia = (() => ({
      matches: true,
      media: '(orientation: portrait)',
      addEventListener: addMqlSpy,
      removeEventListener: removeMqlSpy,
    })) as any;

    const cb = vi.fn();
    const cleanup = onOrientationChange(cb);

    expect(addMqlSpy).toHaveBeenCalledWith('change', expect.any(Function));
    expect(addWindowSpy).toHaveBeenCalledWith('resize', expect.any(Function));

    cleanup();

    expect(removeMqlSpy).toHaveBeenCalledWith('change', expect.any(Function));
    expect(removeWindowSpy).toHaveBeenCalledWith('resize', expect.any(Function));

    window.matchMedia = original;
    addWindowSpy.mockRestore();
    removeWindowSpy.mockRestore();
  });
});
