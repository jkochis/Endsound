// Main entry point - TypeScript + Vanilla JS (no jQuery)
import './socket-client';
import { handleNotePlay, handleNoteStop, handleParamChange } from './audio';
import { isTouchDevice } from './mobile-detect';

console.log('Endsound - TypeScript Edition');

if (isTouchDevice()) {
  // Dynamic import keeps mobile code out of the desktop bundle path
  import('./mobile-controller').then(({ MobileController }) => {
    new MobileController(handleNotePlay, handleNoteStop, handleParamChange);
  });
}
