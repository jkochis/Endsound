// Audio system - TypeScript + Vanilla JS (no jQuery)
import type { KeyboardEvent as KBEvent, KSParams } from './types';
import { Keyboard } from './keyboard';

// Volume processor class
class Volume {
  private volume: number;

  constructor(volume: number) {
    this.volume = volume;
  }

  setVolume(volume: number): void {
    this.volume = volume;
    // Send volume update to AudioWorklet
    if (window.audioWorkletNode) {
      window.audioWorkletNode.port.postMessage({
        type: 'setVolume',
        volume: volume,
      });
    }
  }

  getVolume(): number {
    return this.volume;
  }
}

// Audio configuration
const generator: [number, number] = [700, 1200];
const sampleRate = 44100;
const prebufferSize = 8 * 512; // Legacy, not used with Web Audio API

// Global audio state
window.audioContext = null;
window.audioWorkletNode = null;
const volume = new Volume(0.8);

// Lazy audio init — split into sync (context creation) and async (worklet loading)
let audioReadyPromise: Promise<void> | null = null;

// Must be called synchronously inside a user-gesture handler so the browser
// allows the AudioContext to start in "running" state.
function createContextIfNeeded(): void {
  if (!window.audioContext) {
    window.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  // Resume must also happen synchronously in the gesture call-stack
  if (window.audioContext.state === 'suspended') {
    window.audioContext.resume();
  }
}

// ScriptProcessorNode fallback for browsers without AudioWorklet support.
// Mirrors the KS synthesis from public/audio-processor.js on the main thread.
function createScriptProcessorFallback(ctx: AudioContext): void {
  const PLAYING = 0;
  const RELEASING = 1;
  let masterVolume = 0.8;
  let damp = 0.9;
  let damp2 = 1.0;
  let noiseDamp = 0.5;
  let attack = 0.5;
  let releaseVolume = 0.0001;
  let sustain = false;

  const buffers: Float32Array[] = [];
  for (let i = 0; i < 16; i++) buffers.push(new Float32Array(2048));
  const polyphonyHolder: any[] = [];

  const processor = ctx.createScriptProcessor(2048, 0, 1);

  processor.onaudioprocess = (e) => {
    const out = e.outputBuffer.getChannelData(0);
    const len = out.length;
    for (let i = 0; i < len; i++) {
      out[i] = 0;
      for (let j = 0; j < polyphonyHolder.length; j++) {
        const note = polyphonyHolder[j];
        if (note.phase === RELEASING && !sustain) {
          note.releaseVolume -= releaseVolume;
          if (note.releaseVolume < 0) note.releaseVolume = 0;
        }
        note.periodIndex += note.inc;
        if (note.periodIndex >= note.periodN) {
          note.periodIndex -= note.periodN;
          note.feedNoise = false;
        }
        const pi = Math.floor(note.periodIndex);
        const sub = note.periodIndex - pi;
        if (sub < note.inc) {
          let d = damp;
          if (note.feedNoise) {
            if (note.periodIndex > note.periodN * (1 - attack)) {
              note.period[pi] = (1 / noiseDamp) * (Math.random() - Math.random());
              d *= noiseDamp;
            } else {
              note.period[pi] = note.period[note.periodN - pi];
            }
          }
          note.previous = note.current;
          note.current = (note.current + (note.period[pi] - note.current) * d) * damp2;
          note.period[pi] = note.current;
        }
        out[i] += (sub * note.current + (1 - sub) * note.previous) * note.volume * note.releaseVolume;
      }
    }
    for (let i = 0; i < len; i++) out[i] *= masterVolume;
    for (let j = polyphonyHolder.length - 1; j >= 0; j--) {
      if (polyphonyHolder[j].releaseVolume === 0) {
        buffers.push(polyphonyHolder[j].period);
        polyphonyHolder.splice(j, 1);
      }
    }
  };

  processor.connect(ctx.destination);

  // Create a fake port interface matching AudioWorkletNode.port.postMessage
  const fakePort = {
    postMessage(data: any) {
      switch (data.type) {
        case 'play': {
          const freq = data.frequency;
          let fact = 1;
          if (freq < 200) fact = freq / 205 + 0.05;
          const periodN = fact * ctx.sampleRate / freq;
          for (let j = 0; j < polyphonyHolder.length; j++) {
            if (polyphonyHolder[j].noteStopId === data.noteStopId) {
              const n = polyphonyHolder[j];
              n.phase = PLAYING; n.feedNoise = true; n.periodIndex = 0;
              n.periodN = Math.floor(periodN);
              n.inc = fact * Math.floor(periodN) / periodN;
              n.releaseVolume = 1.0; n.volume = data.volume;
              return;
            }
          }
          if (periodN < 2048 && buffers.length > 0) {
            polyphonyHolder.push({
              noteStopId: data.noteStopId, periodIndex: 0, periodN: Math.floor(periodN),
              period: buffers.pop()!, feedNoise: true, previous: 0, current: 0,
              inc: fact * Math.floor(periodN) / periodN,
              volume: data.volume, phase: PLAYING, releaseVolume: 1.0,
            });
          }
          break;
        }
        case 'stop':
          for (const n of polyphonyHolder) {
            if (n.noteStopId === data.noteStopId) { n.phase = RELEASING; break; }
          }
          break;
        case 'sustain':
          if (data.value === true || data.value === 'on') sustain = true;
          else if (data.value === false || data.value === 'off') sustain = false;
          else if (data.value === 'switch') sustain = !sustain;
          break;
        case 'setVolume':
          masterVolume = data.volume;
          break;
        case 'setParams':
          if (data.params) {
            if (data.params.damp !== undefined) damp = data.params.damp;
            if (data.params.damp2 !== undefined) damp2 = data.params.damp2;
            if (data.params.noiseDamp !== undefined) noiseDamp = data.params.noiseDamp;
            if (data.params.attack !== undefined) attack = data.params.attack;
            if (data.params.release !== undefined) releaseVolume = data.params.release;
          }
          break;
      }
    }
  };

  // Expose as if it were an AudioWorkletNode
  window.audioWorkletNode = { port: fakePort } as any;
  console.log('Audio initialized with ScriptProcessor fallback');
}

async function loadWorklet(): Promise<void> {
  try {
    const ctx = window.audioContext!;

    // Use AudioWorklet if available, otherwise fall back to ScriptProcessorNode
    if (ctx.audioWorklet) {
      await ctx.audioWorklet.addModule('/audio-processor.js');
      window.audioWorkletNode = new AudioWorkletNode(ctx, 'ks-audio-processor');
      window.audioWorkletNode.connect(ctx.destination);
      console.log('Web Audio API initialized (AudioWorklet)');
    } else {
      createScriptProcessorFallback(ctx);
    }

    console.log('Sample rate:', ctx.sampleRate);

    window.audioWorkletNode!.port.postMessage({
      type: 'setVolume',
      volume: 0.8,
    });
  } catch (error) {
    console.error('Failed to initialize Web Audio API:', error);
    const msg = error instanceof Error ? error.message : String(error);
    alert('Audio initialization failed: ' + msg);
    audioReadyPromise = null;
    throw error;
  }
}

// Ensures audio is initialised exactly once; safe to call repeatedly.
// The AudioContext is created synchronously (preserving the user gesture),
// then the worklet is loaded asynchronously.
function ensureAudio(): Promise<void> {
  createContextIfNeeded();
  if (window.audioWorkletNode) return Promise.resolve();
  if (!audioReadyPromise) {
    audioReadyPromise = loadWorklet();
  }
  return audioReadyPromise;
}

// Back-compat alias
const initAudio = ensureAudio;

// Shared note handlers — used by both desktop Keyboard and mobile HexKeyboard
function handleNotePlay(event: KBEvent): void {
  ensureAudio().then(() => {
    if (window.audioWorkletNode) {
      window.audioWorkletNode.port.postMessage({
        type: 'play',
        noteStopId: event.keyId,
        frequency: event.hz,
        volume: event.volume,
      });
    }
  });
  // Send to server immediately (doesn't need audio)
  if (window.socket) {
    window.socket.emit('note:play', {
      keyId: event.keyId,
      hz: event.hz,
      volume: event.volume,
    });
  }
}

function handleNoteStop(event: KBEvent): void {
  ensureAudio().then(() => {
    if (window.audioWorkletNode) {
      window.audioWorkletNode.port.postMessage({
        type: 'stop',
        noteStopId: event.keyId,
      });
    }
  });
  if (window.socket) {
    window.socket.emit('note:stop', {
      keyId: event.keyId,
    });
  }
}

function handleSustain(event: any): void {
  if (window.audioWorkletNode) {
    window.audioWorkletNode.port.postMessage({
      type: 'sustain',
      value: event,
    });
  }
  if (window.socket) {
    window.socket.emit('note:sustain', {
      keyId: event.keyId,
      hz: event.hz,
      volume: event.volume,
    });
  }
}

function handleParamChange(params: KSParams): void {
  if (window.audioWorkletNode) {
    window.audioWorkletNode.port.postMessage({
      type: 'setParams',
      params,
    });
  }
}

// Initialize keyboard using shared handlers
const keyBoard = new Keyboard(handleNotePlay, handleNoteStop, handleSustain);
keyBoard.setGenerator(generator);

// Initialize UI controls (vanilla JS, no jQuery)
function initUI(): void {
  // Reverb checkbox
  const reverbCheckbox = document.getElementById('reverb') as HTMLInputElement;
  if (reverbCheckbox) {
    reverbCheckbox.addEventListener('change', () => {
      const reverbOn = reverbCheckbox.checked;
      console.log('Reverb:', reverbOn);
    });
  }

  // Delay checkbox
  const delayCheckbox = document.getElementById('delay') as HTMLInputElement;
  if (delayCheckbox) {
    delayCheckbox.addEventListener('change', () => {
      const delayOn = delayCheckbox.checked;
      console.log('Delay:', delayOn);
    });
  }

  // Master volume slider
  const masterVolumeSlider = document.getElementById('masterVolume') as HTMLInputElement;
  const masterVolumeLabel = document.getElementById('masterVolumeLabel');

  if (masterVolumeSlider && masterVolumeLabel) {
    masterVolumeLabel.textContent = '0.8';

    masterVolumeSlider.addEventListener('input', (e) => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      masterVolumeLabel.textContent = value.toFixed(2);
      volume.setVolume(value);
    });
  }

  // Buffer size slider
  const bufferSlider = document.getElementById('buffer') as HTMLInputElement;
  const bufferLabel = document.getElementById('bufferLabel');

  if (bufferSlider && bufferLabel) {
    const updateBufferLabel = (size: number) => {
      const latency = ((1000 * size) / sampleRate).toFixed(0);
      bufferLabel.textContent = `${size} samples, ${latency} ms latency`;
    };

    updateBufferLabel(prebufferSize);

    bufferSlider.addEventListener('input', (e) => {
      const value = parseInt((e.target as HTMLInputElement).value);
      const bufferSize = value * 1024;
      updateBufferLabel(bufferSize);
    });
  }
}

// Initialize audio on user interaction (required by modern browsers)
function setupAudioInitialization(): void {
  // Create Start Audio button
  const startButton = document.createElement('button');
  startButton.id = 'startAudio';
  startButton.textContent = 'Start Audio';
  startButton.style.cssText = 'position: fixed; top: 10px; right: 10px; z-index: 1000; padding: 10px 20px; font-size: 16px; cursor: pointer; background: #4CAF50; color: white; border: none; border-radius: 4px;';
  document.body.appendChild(startButton);

  startButton.addEventListener('click', async () => {
    await ensureAudio();
    startButton.style.display = 'none';
  });

  // Also try to initialize on any key press
  const keyPressHandler = async () => {
    if (!window.audioContext) {
      await ensureAudio();
      startButton.style.display = 'none';
    }
    document.removeEventListener('keydown', keyPressHandler);
  };
  document.addEventListener('keydown', keyPressHandler);

  // Initialize on touch for mobile devices
  const touchHandler = async () => {
    if (!window.audioContext) {
      await ensureAudio();
      startButton.style.display = 'none';
    }
    document.removeEventListener('touchstart', touchHandler);
  };
  document.addEventListener('touchstart', touchHandler);
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initUI();
    setupAudioInitialization();
  });
} else {
  initUI();
  setupAudioInitialization();
}

export { initAudio, ensureAudio, volume, keyBoard, handleNotePlay, handleNoteStop, handleSustain, handleParamChange };
