// Canvas-rendered piano keyboard for touch devices
import type { KeyboardEvent as KBEvent } from './types';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Which notes are black keys (sharps/flats)
const IS_BLACK = [false, true, false, true, false, false, true, false, true, false, true, false];

// Black key positions relative to their neighboring white keys
const BLACK_OFFSETS = [-1, 0.6, -1, 0.6, -1, -1, 0.6, -1, 0.6, -1, 0.6, -1];

interface PianoKey {
  id: string;
  hz: number;
  semitone: number; // absolute semitone number
  x: number;
  y: number;
  w: number;
  h: number;
  isBlack: boolean;
  label: string;
}

export class PianoKeyboard {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private keys: PianoKey[] = [];
  private activeTouches: Map<number, PianoKey> = new Map();
  private onPlay: (event: KBEvent) => void;
  private onStop: (event: KBEvent) => void;
  private octaveOffset: number;
  private numOctaves = 2;

  constructor(
    canvas: HTMLCanvasElement,
    onPlay: (event: KBEvent) => void,
    onStop: (event: KBEvent) => void,
    octaveOffset = 0,
  ) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.onPlay = onPlay;
    this.onStop = onStop;
    this.octaveOffset = octaveOffset;

    this.resize();
    this.buildKeys();
    this.render();
    this.bindTouch();
  }

  private resize(): void {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  destroy(): void {
    this.canvas.removeEventListener('touchstart', this.handleTouchStart);
    this.canvas.removeEventListener('touchmove', this.handleTouchMove);
    this.canvas.removeEventListener('touchend', this.handleTouchEnd);
    this.canvas.removeEventListener('touchcancel', this.handleTouchEnd);
    for (const key of this.activeTouches.values()) {
      this.onStop({ keyId: key.id, hz: key.hz, volume: 0 });
    }
    this.activeTouches.clear();
  }

  private buildKeys(): void {
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Start octave: C4 is middle C (semitone 48 from C0)
    // With octaveOffset, shift the starting octave
    const startOctave = 4 + this.octaveOffset;
    const startSemitone = startOctave * 12; // C of that octave

    const whiteKeysPerOctave = 7;
    const totalWhiteKeys = this.numOctaves * whiteKeysPerOctave;
    const whiteKeyWidth = w / totalWhiteKeys;
    const whiteKeyHeight = h;
    const blackKeyWidth = whiteKeyWidth * 0.6;
    const blackKeyHeight = h * 0.6;

    this.keys = [];

    // Build white keys first (drawn first, under black keys)
    let whiteIdx = 0;
    for (let oct = 0; oct < this.numOctaves; oct++) {
      for (let semi = 0; semi < 12; semi++) {
        const absSemi = startSemitone + oct * 12 + semi;
        const hz = 16.35 * Math.pow(2, absSemi / 12);
        const noteIdx = semi % 12;
        const octNum = Math.floor(absSemi / 12);
        const label = NOTE_NAMES[noteIdx] + octNum;
        const id = `piano_${absSemi}`;

        if (!IS_BLACK[noteIdx]) {
          this.keys.push({
            id, hz, semitone: absSemi,
            x: whiteIdx * whiteKeyWidth,
            y: 0,
            w: whiteKeyWidth,
            h: whiteKeyHeight,
            isBlack: false,
            label,
          });
          whiteIdx++;
        }
      }
    }

    // Build black keys (drawn on top)
    whiteIdx = 0;
    for (let oct = 0; oct < this.numOctaves; oct++) {
      for (let semi = 0; semi < 12; semi++) {
        const absSemi = startSemitone + oct * 12 + semi;
        const noteIdx = semi % 12;

        if (!IS_BLACK[noteIdx]) {
          whiteIdx++;
        } else {
          const hz = 16.35 * Math.pow(2, absSemi / 12);
          const octNum = Math.floor(absSemi / 12);
          const label = NOTE_NAMES[noteIdx] + octNum;
          const id = `piano_${absSemi}`;

          // Position black key between the two neighboring white keys
          const bx = (whiteIdx - 1 + BLACK_OFFSETS[noteIdx]) * whiteKeyWidth;

          this.keys.push({
            id, hz, semitone: absSemi,
            x: bx,
            y: 0,
            w: blackKeyWidth,
            h: blackKeyHeight,
            isBlack: true,
            label,
          });
        }
      }
    }
  }

  private render(): void {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const activeIds = new Set([...this.activeTouches.values()].map(k => k.id));

    // Draw white keys first
    for (const key of this.keys) {
      if (key.isBlack) continue;
      const active = activeIds.has(key.id);
      ctx.fillStyle = active ? '#c5cae9' : '#f5f5f5';
      ctx.fillRect(key.x, key.y, key.w, key.h);
      ctx.strokeStyle = '#999';
      ctx.lineWidth = 1;
      ctx.strokeRect(key.x, key.y, key.w, key.h);

      // Label at bottom
      ctx.fillStyle = active ? '#1a237e' : '#666';
      ctx.font = `${Math.max(10, key.w * 0.28)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(key.label, key.x + key.w / 2, key.h - 8);
    }

    // Draw black keys on top
    for (const key of this.keys) {
      if (!key.isBlack) continue;
      const active = activeIds.has(key.id);
      ctx.fillStyle = active ? '#5c6bc0' : '#333';
      ctx.fillRect(key.x, key.y, key.w, key.h);
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 1;
      ctx.strokeRect(key.x, key.y, key.w, key.h);

      ctx.fillStyle = active ? '#e8eaf6' : '#bbb';
      ctx.font = `${Math.max(8, key.w * 0.28)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(key.label, key.x + key.w / 2, key.h - 6);
    }
  }

  private hitTest(x: number, y: number): PianoKey | null {
    // Check black keys first (they're on top)
    for (const key of this.keys) {
      if (!key.isBlack) continue;
      if (x >= key.x && x <= key.x + key.w && y >= key.y && y <= key.y + key.h) {
        return key;
      }
    }
    // Then white keys
    for (const key of this.keys) {
      if (key.isBlack) continue;
      if (x >= key.x && x <= key.x + key.w && y >= key.y && y <= key.y + key.h) {
        return key;
      }
    }
    return null;
  }

  private handleTouchStart = (e: TouchEvent): void => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      const key = this.hitTest(t.clientX, t.clientY);
      if (key) {
        this.activeTouches.set(t.identifier, key);
        this.onPlay({ keyId: key.id, hz: key.hz, volume: 1.0 });
      }
    }
    this.render();
  };

  private handleTouchMove = (e: TouchEvent): void => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      const prev = this.activeTouches.get(t.identifier);
      const key = this.hitTest(t.clientX, t.clientY);

      if (key && (!prev || prev.id !== key.id)) {
        if (prev) {
          this.onStop({ keyId: prev.id, hz: prev.hz, volume: 0 });
        }
        this.activeTouches.set(t.identifier, key);
        this.onPlay({ keyId: key.id, hz: key.hz, volume: 1.0 });
      } else if (!key && prev) {
        this.onStop({ keyId: prev.id, hz: prev.hz, volume: 0 });
        this.activeTouches.delete(t.identifier);
      }
    }
    this.render();
  };

  private handleTouchEnd = (e: TouchEvent): void => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      const key = this.activeTouches.get(t.identifier);
      if (key) {
        this.onStop({ keyId: key.id, hz: key.hz, volume: 0 });
        this.activeTouches.delete(t.identifier);
      }
    }
    this.render();
  };

  private bindTouch(): void {
    this.canvas.addEventListener('touchstart', this.handleTouchStart, { passive: false });
    this.canvas.addEventListener('touchmove', this.handleTouchMove, { passive: false });
    this.canvas.addEventListener('touchend', this.handleTouchEnd, { passive: false });
    this.canvas.addEventListener('touchcancel', this.handleTouchEnd, { passive: false });
  }

  refresh(): void {
    this.resize();
    this.buildKeys();
    this.render();
  }
}
