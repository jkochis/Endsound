Shadowbox.init({
  skipSetup: true
});

// Socket.IO 4.x initialization
var socket = io({
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: Infinity
});