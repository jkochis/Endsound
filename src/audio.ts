// Audio system - TypeScript + Vanilla JS (no jQuery)
import type { KeyboardEvent as KBEvent } from './types';
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

// Initialize Web Audio API
async function initAudio(): Promise<void> {
  try {
    // Create AudioContext
    window.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

    // Load the AudioWorklet processor
    await window.audioContext.audioWorklet.addModule('/audio-processor.js');

    // Create the AudioWorklet node
    window.audioWorkletNode = new AudioWorkletNode(window.audioContext, 'ks-audio-processor');

    // Connect to output
    window.audioWorkletNode.connect(window.audioContext.destination);

    console.log('Web Audio API initialized successfully');
    console.log('Sample rate:', window.audioContext.sampleRate);

    // Update volume in the worklet
    window.audioWorkletNode.port.postMessage({
      type: 'setVolume',
      volume: 0.8,
    });
  } catch (error) {
    console.error('Failed to initialize Web Audio API:', error);
    alert('Audio initialization failed. Please make sure you are using a modern browser that supports Web Audio API.');
  }
}

// Initialize keyboard
const keyBoard = new Keyboard(
  // onKeyDown
  (event: KBEvent) => {
    // Send play message to audio worklet
    if (window.audioWorkletNode) {
      window.audioWorkletNode.port.postMessage({
        type: 'play',
        noteStopId: event.keyId,
        frequency: event.hz,
        volume: event.volume,
      });
    }

    // Send to server via Socket.IO
    if (window.socket) {
      window.socket.emit('note:play', {
        keyId: event.keyId,
        hz: event.hz,
        volume: event.volume,
      });
    }
  },
  // onKeyUp
  (event: KBEvent) => {
    // Send stop message to audio worklet
    if (window.audioWorkletNode) {
      window.audioWorkletNode.port.postMessage({
        type: 'stop',
        noteStopId: event.keyId,
      });
    }

    // Send to server via Socket.IO
    if (window.socket) {
      window.socket.emit('note:stop', {
        keyId: event.keyId,
      });
    }
  },
  // onSustain
  (event: KBEvent) => {
    // Send sustain message to audio worklet
    if (window.audioWorkletNode) {
      window.audioWorkletNode.port.postMessage({
        type: 'sustain',
        value: event,
      });
    }

    // Send to server via Socket.IO
    if (window.socket) {
      window.socket.emit('note:sustain', {
        keyId: event.keyId,
        hz: event.hz,
        volume: event.volume,
      });
    }
  }
);

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
    await initAudio();
    startButton.style.display = 'none';
  });

  // Also try to initialize on any key press
  const keyPressHandler = async () => {
    if (!window.audioContext) {
      await initAudio();
      startButton.style.display = 'none';
    }
    document.removeEventListener('keydown', keyPressHandler);
  };
  document.addEventListener('keydown', keyPressHandler);
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

export { initAudio, volume, keyBoard };
