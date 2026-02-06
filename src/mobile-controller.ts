// Orchestrates landscape hex-keyboard vs portrait sound-editor on mobile
import type { KeyboardEvent as KBEvent, KSParams } from './types';
import { getOrientation, onOrientationChange, type Orientation } from './mobile-detect';
import { HexKeyboard } from './hex-keyboard';
import { PianoKeyboard } from './piano-keyboard';
import { SoundEditor, type NoteLayout } from './sound-editor';

export class MobileController {
  private orientation: Orientation;
  private hexKeyboard: HexKeyboard | null = null;
  private pianoKeyboard: PianoKeyboard | null = null;
  private soundEditor: SoundEditor | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private cleanupOrientation: (() => void) | null = null;

  private currentParams: KSParams | null = null;
  private currentOctave = 0;
  private currentLayout: NoteLayout = 'hex';
  private onPlay: (event: KBEvent) => void;
  private onStop: (event: KBEvent) => void;
  private onParamChange: (params: KSParams) => void;

  constructor(
    onPlay: (event: KBEvent) => void,
    onStop: (event: KBEvent) => void,
    onParamChange: (params: KSParams) => void,
  ) {
    this.onPlay = onPlay;
    this.onStop = onStop;
    this.onParamChange = (params) => {
      this.currentParams = params;
      onParamChange(params);
    };

    // Hide desktop UI
    this.hideDesktopUI();

    this.orientation = getOrientation();
    this.enterMode(this.orientation);

    this.cleanupOrientation = onOrientationChange((o) => {
      if (o !== this.orientation) {
        this.leaveMode();
        this.orientation = o;
        this.enterMode(o);
      }
    });
  }

  destroy(): void {
    this.leaveMode();
    if (this.cleanupOrientation) {
      this.cleanupOrientation();
      this.cleanupOrientation = null;
    }
  }

  private hideDesktopUI(): void {
    const desc = document.getElementById('description');
    if (desc) desc.style.display = 'none';
    const modal = document.getElementById('modal-connect');
    if (modal) modal.style.display = 'none';
    const startBtn = document.getElementById('startAudio');
    if (startBtn) startBtn.style.display = 'none';
  }

  private enterMode(orientation: Orientation): void {
    if (orientation === 'landscape') {
      this.canvas = document.createElement('canvas');
      this.canvas.id = 'hex-canvas';
      document.body.appendChild(this.canvas);
      if (this.currentLayout === 'piano') {
        this.pianoKeyboard = new PianoKeyboard(this.canvas, this.onPlay, this.onStop, this.currentOctave);
      } else {
        this.hexKeyboard = new HexKeyboard(this.canvas, this.onPlay, this.onStop, this.currentOctave);
      }
    } else {
      this.soundEditor = new SoundEditor(
        this.onParamChange,
        (octave) => { this.currentOctave = octave; },
        (layout) => { this.currentLayout = layout; },
        this.currentParams ?? undefined,
        this.currentOctave,
        this.currentLayout,
      );
    }
  }

  private leaveMode(): void {
    if (this.hexKeyboard) {
      this.hexKeyboard.destroy();
      this.hexKeyboard = null;
    }
    if (this.pianoKeyboard) {
      this.pianoKeyboard.destroy();
      this.pianoKeyboard = null;
    }
    if (this.canvas) {
      this.canvas.remove();
      this.canvas = null;
    }
    if (this.soundEditor) {
      this.soundEditor.destroy();
      this.soundEditor = null;
    }
  }
}
