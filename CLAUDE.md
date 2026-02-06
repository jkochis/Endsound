# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Endsound is a collaborative, browser-based music creation platform using real-time WebSocket communication. Multiple users connect via Socket.IO to play a Wicki-Hayden isomorphic keyboard together, with Karplus-Strong string synthesis running in an AudioWorklet.

## Commands

```bash
# Development (runs Vite client + Express server concurrently)
npm run dev

# Client only (Vite dev server, port 3000, HMR)
npm run dev:client

# Server only (Express + Socket.IO, port 666, nodemon)
npm run dev:server

# Production build (tsc + vite build → dist/)
npm run build

# Start production server
npm start
```

No test framework or linter is configured. TypeScript strict mode (`tsconfig.json`) is the primary code quality check.

## Architecture

**Client-server with real-time messaging:**

- **Client** (`src/`): Vanilla TypeScript, no UI framework. Entry point is `src/main.ts`.
- **Server** (`server.js`): Express + Socket.IO. Validates and broadcasts note events between clients. Tracks sessions, buffers last 15 messages for late joiners.
- **Audio synthesis** (`public/audio-processor.js`): AudioWorklet running Karplus-Strong algorithm with 16-voice polyphony. Runs on a separate thread.

**Data flow:** Keypress → `src/keyboard.ts` → `src/audio.ts` (local playback via AudioWorklet + emit via Socket.IO) → `server.js` (validate & broadcast) → other clients play received notes.

### Key source files

| File | Purpose |
|------|---------|
| `src/main.ts` | Entry point, wires up audio and socket |
| `src/audio.ts` | Web Audio API setup, Volume class, UI controls |
| `src/keyboard.ts` | Wicki-Hayden keyboard mapping (QWERTY → frequencies), octave/sustain handling |
| `src/socket-client.ts` | Socket.IO client with typed events |
| `src/types/index.ts` | Shared TypeScript interfaces (NoteEvent, SocketMessage, window augmentation) |
| `public/audio-processor.js` | AudioWorklet processor (Karplus-Strong synthesis) |
| `server.js` | Express server with Helmet, CORS, rate limiting, Socket.IO event handling |
| `lib/` | Legacy pre-TypeScript JS files (migration source, not actively used) |

### Socket events

`note:play`, `note:stop`, `note:sustain` — all validated server-side (frequency 20–20000 Hz, volume 0–1, keyId max 100 chars).

## Development Setup

- Node.js ≥18 required (ES modules throughout, `"type": "module"`)
- Copy `.env.example` to `.env` for configuration (PORT, CORS_ORIGIN, rate limits)
- Vite dev server (port 3000) proxies Socket.IO to Express (port 666) via `vite.config.ts`

## Build Output

Production build goes to `dist/`. Express serves static files from `dist/` in production, root `./` in development.
