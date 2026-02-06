// Canvas-rendered Wicki-Hayden hexagonal keyboard for touch devices
import type { KeyboardEvent as KBEvent, HexNote } from './types';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const BASE_FREQ = 293.66; // D4
const SQRT3 = Math.sqrt(3);

// Pitch-class colours (chromatic wheel, muted pastels)
const PITCH_COLORS: string[] = [
  '#e57373', // C
  '#f06292', // C#
  '#ba68c8', // D
  '#9575cd', // D#
  '#7986cb', // E
  '#64b5f6', // F
  '#4fc3f7', // F#
  '#4dd0e1', // G
  '#4db6ac', // G#
  '#81c784', // A
  '#aed581', // A#
  '#dce775', // B
];

function hzToPitchClass(hz: number): number {
  // semitones above C0 (16.35 Hz), mod 12
  const semis = 12 * Math.log2(hz / 16.35);
  return ((Math.round(semis) % 12) + 12) % 12;
}

function hzToNoteName(hz: number): string {
  const semis = 12 * Math.log2(hz / 16.35);
  const idx = ((Math.round(semis) % 12) + 12) % 12;
  const octave = Math.floor(Math.round(semis) / 12);
  return NOTE_NAMES[idx] + octave;
}

export class HexKeyboard {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private notes: HexNote[] = [];
  private activeTouches: Map<number, HexNote> = new Map(); // Touch.identifier → HexNote
  private onPlay: (event: KBEvent) => void;
  private onStop: (event: KBEvent) => void;

  // Grid dimensions
  private rows = 4;
  private cols = 10;
  private octaveOffset = 0;

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
    this.buildGrid();
    this.render();
    this.bindTouch();
  }

  resize(): void {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  destroy(): void {
    this.canvas.removeEventListener('touchstart', this.handleTouchStart);
    this.canvas.removeEventListener('touchmove', this.handleTouchMove);
    this.canvas.removeEventListener('touchend', this.handleTouchEnd);
    this.canvas.removeEventListener('touchcancel', this.handleTouchEnd);
    // Stop all active notes
    for (const note of this.activeTouches.values()) {
      this.onStop({ keyId: note.id, hz: note.hz, volume: 0 });
    }
    this.activeTouches.clear();
  }

  private buildGrid(): void {
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Flat-top hexagons: width = 2r, height = sqrt(3) * r
    // Rows stack vertically with height sqrt(3)*r, cols offset by 1.5*r
    const hexRadius = Math.min(
      h / (this.rows * SQRT3 + 1),
      w / (this.cols * 1.5 + 0.5),
    );

    const hexH = SQRT3 * hexRadius;

    // Centre the grid
    const gridW = this.cols * 1.5 * hexRadius + 0.5 * hexRadius;
    const gridH = this.rows * hexH + hexH * 0.5;
    const offsetX = (w - gridW) / 2 + hexRadius;
    const offsetY = (h - gridH) / 2 + hexH * 0.5;

    this.notes = [];

    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        const cx = offsetX + col * 1.5 * hexRadius;
        const cy = offsetY + row * hexH + (col % 2 === 1 ? hexH / 2 : 0);

        // Wicki-Hayden: same math as desktop keyboard.ts
        // col maps to fifths (700 cents), row maps to octaves (1200 cents)
        // Offsets centre the grid so all frequencies stay within 20–20000 Hz
        const cr = row - 1;
        const cc = col - 4;
        const hz = BASE_FREQ * Math.pow(2, ((cr + this.octaveOffset) * 1200 + cc * 700) / 1200);

        const id = `hex_${cc}_${cr}`;
        this.notes.push({ id, hz, col, row, cx, cy, radius: hexRadius });
      }
    }
  }

  private render(): void {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const activeIds = new Set([...this.activeTouches.values()].map(n => n.id));

    for (const note of this.notes) {
      const pc = hzToPitchClass(note.hz);
      const baseColor = PITCH_COLORS[pc];
      const isActive = activeIds.has(note.id);

      // Draw hex
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i;
        const x = note.cx + note.radius * Math.cos(angle);
        const y = note.cy + note.radius * Math.sin(angle);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();

      ctx.fillStyle = isActive ? '#ffffff' : baseColor;
      ctx.fill();
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Label
      const label = hzToNoteName(note.hz);
      ctx.fillStyle = isActive ? '#000' : '#222';
      ctx.font = `${Math.max(10, note.radius * 0.35)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, note.cx, note.cy);
    }
  }

  private hitTest(x: number, y: number): HexNote | null {
    for (const note of this.notes) {
      const dx = Math.abs(x - note.cx);
      const dy = Math.abs(y - note.cy);
      // Quick bounding-box reject
      if (dx > note.radius || dy > note.radius) continue;
      // Hex hit: for flat-top, check dx*0.5 + dy*(sqrt3/2) <= r*(sqrt3/2)
      if (dx * 0.5 + dy * (SQRT3 / 2) <= note.radius * (SQRT3 / 2)) {
        return note;
      }
    }
    return null;
  }

  // Arrow functions to preserve `this` when used as event listeners
  private handleTouchStart = (e: TouchEvent): void => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      const note = this.hitTest(t.clientX, t.clientY);
      if (note) {
        this.activeTouches.set(t.identifier, note);
        this.onPlay({ keyId: note.id, hz: note.hz, volume: 1.0 });
      }
    }
    this.render();
  };

  private handleTouchMove = (e: TouchEvent): void => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      const prev = this.activeTouches.get(t.identifier);
      const note = this.hitTest(t.clientX, t.clientY);

      if (note && (!prev || prev.id !== note.id)) {
        // Glissando: stop old note, start new note
        if (prev) {
          this.onStop({ keyId: prev.id, hz: prev.hz, volume: 0 });
        }
        this.activeTouches.set(t.identifier, note);
        this.onPlay({ keyId: note.id, hz: note.hz, volume: 1.0 });
      } else if (!note && prev) {
        // Finger moved off all hexes
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
      const note = this.activeTouches.get(t.identifier);
      if (note) {
        this.onStop({ keyId: note.id, hz: note.hz, volume: 0 });
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
    this.buildGrid();
    this.render();
  }
}
