// Type definitions for Endsound

import type { Socket } from 'socket.io-client';

export interface NoteEvent {
  keyId: string;
  hz: number;
  volume: number;
}

export interface NoteStopEvent {
  keyId: string;
}

export interface SustainEvent {
  keyId: string;
  hz: number;
  volume: number;
}

export interface SocketMessage {
  type: 'note:play' | 'note:stop' | 'note:sustain';
  sessionId: string;
  data: NoteEvent | NoteStopEvent | SustainEvent;
  timestamp: number;
}

export interface WelcomeMessage {
  sessionId: string;
  activeSessions: string[];
  messageHistory: SocketMessage[];
}

export interface SessionJoinedMessage {
  sessionId: string;
}

export interface SessionLeftMessage {
  sessionId: string;
}

// Keyboard event types
export interface KeyboardEvent {
  keyId: string;
  hz: number;
  volume: number;
}

// Audio Worklet message types
export interface AudioWorkletMessage {
  type: 'play' | 'stop' | 'sustain' | 'setVolume';
  noteStopId?: string;
  frequency?: number;
  volume?: number;
  value?: any;
}

// Karplus-Strong note state
export interface KSNote {
  noteStopId: string;
  periodIndex: number;
  periodN: number;
  period: Float32Array;
  feedNoise: boolean;
  previous: number;
  current: number;
  inc: number;
  volume: number;
  phase: number;
  releaseVolume: number;
}

// Extended Socket type
export type EndsoundSocket = Socket;

// Global window extensions
declare global {
  interface Window {
    audioContext: AudioContext | null;
    audioWorkletNode: AudioWorkletNode | null;
    socket: EndsoundSocket;
  }
}
