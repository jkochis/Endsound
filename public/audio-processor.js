/**
 * AudioWorklet Processor for Endsound
 *
 * This processor runs in the audio rendering thread and handles:
 * - Karplus-Strong synthesis
 * - Polyphonic voice management
 * - Real-time audio generation
 */

class KSAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // Audio parameters
    this.bufferSize = 512;
    this.releaseVolume = 0.0001;
    this.damp = 0.9;
    this.damp2 = 1.0;
    this.noiseDamp = 0.5;
    this.sustain = false;
    this.masterVolume = 0.8;

    // Note playing states
    this.PLAYING = 0;
    this.RELEASING = 1;

    // Create buffers for resonators (for 16 voices)
    this.buffers = [];
    for (let i = 0; i < 16; i++) {
      this.buffers[i] = new Float32Array(2048);
    }

    this.polyphonyHolder = [];

    // Listen for messages from the main thread
    this.port.onmessage = (event) => {
      this.handleMessage(event.data);
    };
  }

  handleMessage(data) {
    switch (data.type) {
      case 'play':
        this.play(data.noteStopId, data.frequency, data.volume);
        break;
      case 'stop':
        this.stop(data.noteStopId);
        break;
      case 'sustain':
        this.setSustain(data.value);
        break;
      case 'setVolume':
        this.masterVolume = data.volume;
        break;
    }
  }

  setSustain(sustain) {
    switch (sustain) {
      case true:
      case 'on':
        this.sustain = true;
        break;
      case false:
      case 'off':
        this.sustain = false;
        break;
      case 'switch':
        this.sustain = !this.sustain;
        break;
    }
  }

  play(noteStopId, frequency, volume) {
    // Generate higher notes and play them lower to remove high overtones
    let fact = 1;
    if (frequency < 200) {
      fact = frequency / 205 + 0.05;
    }

    const periodN = fact * sampleRate / frequency;

    // If the note is already playing, reactivate it
    for (let j = 0; j < this.polyphonyHolder.length; j++) {
      if (this.polyphonyHolder[j].noteStopId === noteStopId) {
        this.polyphonyHolder[j].phase = this.PLAYING;
        this.polyphonyHolder[j].feedNoise = true;
        this.polyphonyHolder[j].periodIndex = 0;
        this.polyphonyHolder[j].periodN = Math.floor(periodN);
        this.polyphonyHolder[j].inc = fact * Math.floor(periodN) / periodN;
        this.polyphonyHolder[j].releaseVolume = 1.0;
        this.polyphonyHolder[j].volume = volume;
        return;
      }
    }

    // Play the note if it fits in the buffer and there is a buffer available
    if (periodN < 2048 && this.buffers.length > 0) {
      const buffer = this.buffers.pop();
      this.polyphonyHolder.push({
        noteStopId: noteStopId,
        periodIndex: 0.0,
        periodN: Math.floor(periodN),
        period: buffer,
        feedNoise: true,
        previous: 0.0,
        current: 0.0,
        inc: fact * Math.floor(periodN) / periodN,
        volume: volume,
        phase: this.PLAYING,
        releaseVolume: 1.0
      });
    }
  }

  stop(noteStopId) {
    for (let j = 0; j < this.polyphonyHolder.length; j++) {
      if (this.polyphonyHolder[j].noteStopId === noteStopId) {
        this.polyphonyHolder[j].phase = this.RELEASING;
        break;
      }
    }
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    const outputChannel = output[0];
    const frameCount = outputChannel.length;

    // Generate audio samples
    for (let i = 0; i < frameCount; i++) {
      outputChannel[i] = 0.0;

      if (this.polyphonyHolder.length > 0) {
        for (let j = 0; j < this.polyphonyHolder.length; j++) {
          const note = this.polyphonyHolder[j];

          // Handle note release
          if (note.phase === this.RELEASING && !this.sustain) {
            note.releaseVolume -= this.releaseVolume;
            if (note.releaseVolume < 0.0) {
              note.releaseVolume = 0.0;
            }
          }

          note.periodIndex += note.inc;

          // Wrap around delay-line
          if (note.periodIndex >= note.periodN) {
            note.periodIndex -= note.periodN;
            note.feedNoise = false;
          }

          const periodIndex = Math.floor(note.periodIndex);
          const sub = note.periodIndex - periodIndex;

          // Generate a new sample if needed
          if (sub < note.inc) {
            let damp = this.damp;

            if (note.feedNoise) {
              if (note.periodIndex > note.periodN / 2) {
                // Feed noise between -1 and +1
                note.period[periodIndex] = (1 / this.noiseDamp) * (Math.random() - Math.random());
                damp *= this.noiseDamp;
              } else {
                // Make sound more periodic
                note.period[periodIndex] = note.period[note.periodN - periodIndex];
              }
            }

            note.previous = note.current;
            // 1-pole lowpass filter (removing energy from the system)
            note.current = (note.current + (note.period[periodIndex] - note.current) * damp) * this.damp2;
            note.period[periodIndex] = note.current;
          }

          // Linear interpolation for sub-sample accuracy
          outputChannel[i] += (sub * note.current + (1 - sub) * note.previous) *
                              note.volume * note.releaseVolume;
        }
      }
    }

    // Apply master volume
    for (let i = 0; i < frameCount; i++) {
      outputChannel[i] *= this.masterVolume;
    }

    // Remove finished notes
    for (let j = this.polyphonyHolder.length - 1; j >= 0; j--) {
      const note = this.polyphonyHolder[j];
      if (note.releaseVolume === 0.0) {
        this.buffers.push(note.period);
        this.polyphonyHolder.splice(j, 1);
      }
    }

    // Keep the processor alive
    return true;
  }
}

registerProcessor('ks-audio-processor', KSAudioProcessor);
