// Isomorphic keyboard player class - TypeScript version
import type { KeyboardEvent as KBEvent } from './types';

type KeyLocation = [number, number];
type KeyMap = Record<string, KeyLocation>;

export class Keyboard {
  private repeat: Record<string, boolean> = {};
  private octave: number = 0;
  private generator: [number, number] = [700, 1200]; // fifth and octave, in cents
  private baseFreq: number = 293.66; // D3 (or Re)
  private keyMap: KeyMap;

  private notePlayListener: (event: KBEvent) => void;
  private noteStopListener: (event: KBEvent) => void;
  private noteSustainListener: (event: any) => void;

  constructor(
    notePlayListener: (event: KBEvent) => void,
    noteStopListener: (event: KBEvent) => void,
    noteSustainListener: (event: any) => void
  ) {
    this.notePlayListener = notePlayListener;
    this.noteStopListener = noteStopListener;
    this.noteSustainListener = noteSustainListener;

    // Wicki-Hayden isomorphic keyboard layout
    this.keyMap = {
      'Z': [-9, 4],
      'X': [-7, 3],
      'C': [-5, 2],
      'V': [-3, 1],
      'B': [-1, 0],
      'N': [1, -1],
      'M': [3, -2],

      'A': [-10, 5],
      'S': [-8, 4],
      'D': [-6, 3],
      'F': [-4, 2],
      'G': [-2, 1],
      'H': [0, 0],
      'J': [2, -1],
      'K': [4, -2],
      'L': [6, -3],
      ';': [8, -4],

      'Q': [-11, 6],
      'W': [-9, 5],
      'E': [-7, 4],
      'R': [-5, 3],
      'T': [-3, 2],
      'Y': [-1, 1],
      'U': [1, 0],
      'I': [3, -1],
      'O': [5, -2],
      'P': [7, -3],

      '1': [-12, 7],
      '2': [-10, 6],
      '3': [-8, 5],
      '4': [-6, 4],
      '5': [-4, 3],
      '6': [-2, 2],
      '7': [0, 1],
      '8': [2, 0],
      '9': [4, -1],
      '0': [6, -2],

      'q': [-11, 7], // F2
      'r': [-9, 6],  // F3
      's': [-7, 5],  // F4
      't': [-5, 4],  // F5
      'u': [-3, 3],  // F6
      'v': [-1, 2],  // F7
      'w': [1, 1],   // F8
      'x': [3, 0],   // F9
      'y': [5, -1],  // F10
      'z': [7, -2],  // F11
    };

    // Add special characters
    this.keyMap[String.fromCharCode(188)] = [5, -3];  // ','
    this.keyMap[String.fromCharCode(190)] = [7, -4];  // '.'
    this.keyMap[String.fromCharCode(191)] = [9, -5];  // '/'
    this.keyMap[String.fromCharCode(219)] = [9, -4];  // '['

    // Attach keyboard event listeners
    document.addEventListener('keydown', (event) => this.keyDown(event), false);
    document.addEventListener('keyup', (event) => this.keyUp(event), false);
  }

  setGenerator(generator: [number, number]): void {
    this.generator = generator;
  }

  private keyDown(event: globalThis.KeyboardEvent): void {
    const keyId = String.fromCharCode(event.keyCode);

    // Disable key repeat
    if (this.repeat[keyId]) {
      return;
    }
    this.repeat[keyId] = true;

    const loc = this.keyMap[keyId];

    if (loc) {
      event.preventDefault();
      const hz = this.baseFreq * Math.pow(
        2.0,
        ((loc[1] + this.octave) * this.generator[1] + loc[0] * this.generator[0]) / 1200.0
      );
      const noteId = 'k' + loc[0] + '_' + (loc[1] + this.octave);

      this.notePlayListener({
        keyId: noteId,
        hz: hz,
        volume: 1.0,
      });
    } else {
      // Handle special keys
      switch (keyId) {
        case '=':
        case 'k':
          this.octave++;
          return;
        case 'm':
          this.octave--;
          return;
        case ' ':
          event.preventDefault();
          this.noteSustainListener('switch');
          return;
      }
    }
  }

  private keyUp(event: globalThis.KeyboardEvent): void {
    const keyId = String.fromCharCode(event.keyCode);
    this.repeat[keyId] = false; // Disable key repeat

    const loc = this.keyMap[keyId];

    if (loc) {
      const noteId = 'k' + loc[0] + '_' + (loc[1] + this.octave);
      this.noteStopListener({ keyId: noteId, hz: 0, volume: 0 });
    }
  }
}
