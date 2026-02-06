// Portrait-mode sound parameter editor for Karplus-Strong synthesis
import type { KSParams } from './types';

export type NoteLayout = 'hex' | 'piano';

interface SliderDef {
  key: keyof KSParams;
  label: string;
  min: number;
  max: number;
  step: number;
  defaultVal: number;
}

const SLIDERS: SliderDef[] = [
  { key: 'damp',      label: 'Damping',    min: 0.5, max: 1,      step: 0.01,     defaultVal: 0.9 },
  { key: 'damp2',     label: 'Brightness',  min: 0.5, max: 1,      step: 0.01,     defaultVal: 1.0 },
  { key: 'noiseDamp', label: 'Noise Mix',   min: 0.1, max: 1,      step: 0.01,     defaultVal: 0.5 },
  { key: 'attack',    label: 'Attack',      min: 0.05, max: 1,     step: 0.01,     defaultVal: 0.5 },
  { key: 'release',   label: 'Release',     min: 0.00001, max: 0.01, step: 0.00001, defaultVal: 0.0001 },
];

const PRESETS: Record<string, KSParams> = {
  Guitar:  { damp: 0.9,  damp2: 1.0,  noiseDamp: 0.5, attack: 0.5, release: 0.0001 },
  Harp:    { damp: 0.95, damp2: 0.98, noiseDamp: 0.3, attack: 0.3, release: 0.0005 },
  Muted:   { damp: 0.7,  damp2: 0.8,  noiseDamp: 0.6, attack: 0.8, release: 0.001 },
  Bell:    { damp: 0.98, damp2: 1.0,  noiseDamp: 0.2, attack: 0.15, release: 0.00005 },
};

export class SoundEditor {
  private container: HTMLDivElement;
  private params: KSParams;
  private octave: number;
  private layout: NoteLayout;
  private octaveLabel!: HTMLSpanElement;
  private onParamChange: (params: KSParams) => void;
  private onOctaveChange: (octave: number) => void;
  private onLayoutChange: (layout: NoteLayout) => void;
  private sliderInputs: Map<keyof KSParams, HTMLInputElement> = new Map();
  private sliderLabels: Map<keyof KSParams, HTMLSpanElement> = new Map();

  constructor(
    onParamChange: (params: KSParams) => void,
    onOctaveChange: (octave: number) => void,
    onLayoutChange: (layout: NoteLayout) => void,
    initialParams?: KSParams,
    initialOctave?: number,
    initialLayout?: NoteLayout,
  ) {
    this.onParamChange = onParamChange;
    this.onOctaveChange = onOctaveChange;
    this.onLayoutChange = onLayoutChange;
    this.params = initialParams ? { ...initialParams } : { ...PRESETS.Guitar };
    this.octave = initialOctave ?? 0;
    this.layout = initialLayout ?? 'hex';
    this.container = document.createElement('div');
    this.container.id = 'sound-editor';
    this.build();
    document.body.appendChild(this.container);
  }

  destroy(): void {
    this.container.remove();
    this.sliderInputs.clear();
    this.sliderLabels.clear();
  }

  private build(): void {
    const title = document.createElement('h2');
    title.textContent = 'Sound Editor';
    this.container.appendChild(title);

    const hint = document.createElement('p');
    hint.className = 'editor-hint';
    hint.textContent = 'Rotate to landscape to play';
    this.container.appendChild(hint);

    // Octave stepper
    const octaveRow = document.createElement('div');
    octaveRow.className = 'octave-row';

    const octaveLabel = document.createElement('label');
    octaveLabel.textContent = 'Octave';
    octaveRow.appendChild(octaveLabel);

    const minusBtn = document.createElement('button');
    minusBtn.className = 'octave-btn';
    minusBtn.textContent = '\u2212'; // minus sign
    octaveRow.appendChild(minusBtn);

    this.octaveLabel = document.createElement('span');
    this.octaveLabel.className = 'octave-value';
    this.octaveLabel.textContent = String(this.octave);
    octaveRow.appendChild(this.octaveLabel);

    const plusBtn = document.createElement('button');
    plusBtn.className = 'octave-btn';
    plusBtn.textContent = '+';
    octaveRow.appendChild(plusBtn);

    minusBtn.addEventListener('click', () => this.setOctave(this.octave - 1));
    plusBtn.addEventListener('click', () => this.setOctave(this.octave + 1));

    this.container.appendChild(octaveRow);

    // Layout toggle
    const layoutRow = document.createElement('div');
    layoutRow.className = 'layout-row';

    const layoutLabel = document.createElement('label');
    layoutLabel.textContent = 'Layout';
    layoutRow.appendChild(layoutLabel);

    const layouts: { value: NoteLayout; label: string }[] = [
      { value: 'hex', label: 'Hex' },
      { value: 'piano', label: 'Piano' },
    ];

    for (const opt of layouts) {
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'layout';
      radio.id = `layout-${opt.value}`;
      radio.value = opt.value;
      radio.checked = opt.value === this.layout;

      const radioLabel = document.createElement('label');
      radioLabel.htmlFor = radio.id;
      radioLabel.className = 'layout-option' + (radio.checked ? ' active' : '');
      radioLabel.textContent = opt.label;

      radio.addEventListener('change', () => {
        this.layout = opt.value;
        // Update active class on all layout options
        layoutRow.querySelectorAll('.layout-option').forEach(el => el.classList.remove('active'));
        radioLabel.classList.add('active');
        this.onLayoutChange(opt.value);
      });

      layoutRow.appendChild(radio);
      layoutRow.appendChild(radioLabel);
    }

    this.container.appendChild(layoutRow);

    // Preset buttons
    const presetRow = document.createElement('div');
    presetRow.className = 'preset-row';
    for (const [name, preset] of Object.entries(PRESETS)) {
      const btn = document.createElement('button');
      btn.className = 'preset-btn';
      btn.textContent = name;
      btn.addEventListener('click', () => this.applyPreset(preset));
      presetRow.appendChild(btn);
    }
    this.container.appendChild(presetRow);

    // Sliders
    for (const def of SLIDERS) {
      const row = document.createElement('div');
      row.className = 'slider-row';

      const label = document.createElement('label');
      label.textContent = def.label;
      row.appendChild(label);

      const input = document.createElement('input');
      input.type = 'range';
      input.min = String(def.min);
      input.max = String(def.max);
      input.step = String(def.step);
      input.value = String(this.params[def.key]);
      row.appendChild(input);

      const valueLabel = document.createElement('span');
      valueLabel.className = 'slider-value';
      valueLabel.textContent = String(this.params[def.key]);
      row.appendChild(valueLabel);

      this.sliderInputs.set(def.key, input);
      this.sliderLabels.set(def.key, valueLabel);

      input.addEventListener('input', () => {
        const val = parseFloat(input.value);
        this.params[def.key] = val;
        valueLabel.textContent = val.toPrecision(3);
        this.onParamChange({ ...this.params });
      });

      this.container.appendChild(row);
    }
  }

  private setOctave(value: number): void {
    const clamped = Math.max(-2, Math.min(2, value));
    if (clamped === this.octave) return;
    this.octave = clamped;
    this.octaveLabel.textContent = String(clamped);
    this.onOctaveChange(clamped);
  }

  private applyPreset(preset: KSParams): void {
    this.params = { ...preset };
    for (const def of SLIDERS) {
      const input = this.sliderInputs.get(def.key);
      const label = this.sliderLabels.get(def.key);
      if (input && label) {
        input.value = String(preset[def.key]);
        label.textContent = preset[def.key].toPrecision(3);
      }
    }
    this.onParamChange({ ...this.params });
  }
}
