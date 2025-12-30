$(document).ready(function() {
  var truedisconnect = false;

  // Socket.IO 4.x event handlers
  socket.on('connect', function() {
    console.log('Connected to server with ID:', socket.id);
  });

  socket.on('welcome', function(data) {
    console.log('Welcome! Session ID:', data.sessionId);
    console.log('Active sessions:', data.activeSessions.length);
  });

  socket.on('session:joined', function(data) {
    console.log('New user joined:', data.sessionId);
  });

  socket.on('session:left', function(data) {
    console.log('User left:', data.sessionId);
  });

  // Handle incoming note play events
  socket.on('note:play', function(message) {
    if (message && message.data) {
      const event = message.data;
      if (audioWorkletNode) {
        audioWorkletNode.port.postMessage({
          type: 'play',
          noteStopId: event.keyId,
          frequency: event.hz,
          volume: event.volume
        });
      }
    }
  });

  // Handle incoming note stop events
  socket.on('note:stop', function(message) {
    if (message && message.data) {
      const event = message.data;
      if (audioWorkletNode) {
        audioWorkletNode.port.postMessage({
          type: 'stop',
          noteStopId: event.keyId
        });
      }
    }
  });

  // Handle incoming sustain events
  socket.on('note:sustain', function(message) {
    if (message && message.data) {
      const event = message.data;
      if (audioWorkletNode) {
        audioWorkletNode.port.postMessage({
          type: 'sustain',
          value: event
        });
      }
    }
  });

  socket.on('disconnect', function(reason) {
    console.log('Disconnected:', reason);
    // Socket.IO 4.x handles reconnection automatically
  });

  socket.on('connect_error', function(error) {
    console.error('Connection error:', error.message);
  });

  $(window).bind('beforeunload', function() {
    truedisconnect = true;
    socket.disconnect();
  });
});