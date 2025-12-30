// jQuery UI inits
var reverbOn = true;
var delayOn = false;
$(function() {
	//$("#reverb").button();
	$("#reverb").click(function(){
		reverbOn = this.checked;
	});
	reverbOn = $("#reverb").attr('checked');

	//$("#delay").button();
	$("#delay").click(function(){
		delayOn = this.checked;
	});
	delayOn = $("#delay").attr('checked');

	$("#masterVolumeLabel").html(0.8);
	//$("#masterVolume").slider({ min:0.0, max:1.2, step: 0.01, value:0.8 });
	$("#masterVolume").bind("slide", function(event, ui) {
		$("#masterVolumeLabel").html(ui.value);
		volume.setVolume(ui.value);
	});
	
	$("#bufferLabel").html(prebufferSize + ' samples, ' + (1000*prebufferSize/sampleRate).toFixed(0) + ' ms latency');
	//$("#buffer").slider({ min:1, max:10, step: 1, value:6 });
	$("#buffer").bind("slide", function(event, ui) {
		prebufferSize = ui.value * 1024;
		$("#bufferLabel").html(prebufferSize + ' samples, ' + (1000*prebufferSize/sampleRate).toFixed(0) + ' ms latency');
	});	
});

Volume = function(volume){
	this.volume = volume;
}

Volume.prototype.setVolume = function (volume){
	this.volume = volume;
	// Send volume update to AudioWorklet
	if (audioWorkletNode) {
		audioWorkletNode.port.postMessage({
			type: 'setVolume',
			volume: volume
		});
	}
}

Volume.prototype.process = function (samples){
	// change the volume of the samples in place
	for(var i=0; i<samples.length; i++){
		samples[i] = samples[i] * this.volume;
	}
}

var generator = [700, 1200];
var sampleRate = 44100;
var bufferSize = 512;
var prebufferSize = 8*512; // defines the latency (legacy, not used with Web Audio API)

// Web Audio API setup
var audioContext = null;
var audioWorkletNode = null;

// Initialize Web Audio API
async function initAudio() {
	try {
		// Create AudioContext
		audioContext = new (window.AudioContext || window.webkitAudioContext)();

		// Load the AudioWorklet processor
		await audioContext.audioWorklet.addModule('lib/audio-processor.js');

		// Create the AudioWorklet node
		audioWorkletNode = new AudioWorkletNode(audioContext, 'ks-audio-processor');

		// Connect to output
		audioWorkletNode.connect(audioContext.destination);

		console.log('Web Audio API initialized successfully');
		console.log('Sample rate:', audioContext.sampleRate);

		// Update volume in the worklet
		audioWorkletNode.port.postMessage({
			type: 'setVolume',
			volume: 0.8
		});

	} catch (error) {
		console.error('Failed to initialize Web Audio API:', error);
		alert('Audio initialization failed. Please make sure you are using a modern browser that supports Web Audio API.');
	}
}

// load the keyboard
var keyBoard = new Keyboard(this, function(event){
	// Send play message to audio worklet
	if (audioWorkletNode) {
		audioWorkletNode.port.postMessage({
			type: 'play',
			noteStopId: event.keyId,
			frequency: event.hz,
			volume: event.volume
		});
	}

	// Socket.IO 4.x: emit event to server
	socket.emit('note:play', {
		keyId : event.keyId,
		hz : event.hz,
		volume : event.volume
	});
	lastHz = event.hz;  // for display purposes

	// Note: Web Audio API runs in a separate thread, so screen updates won't cause stuttering
}, function(event){
	// Send stop message to audio worklet
	if (audioWorkletNode) {
		audioWorkletNode.port.postMessage({
			type: 'stop',
			noteStopId: event.keyId
		});
	}

	// Socket.IO 4.x: emit event to server
	socket.emit('note:stop', {
		keyId : event.keyId
	});
}, function(event){
	// Send sustain message to audio worklet
	if (audioWorkletNode) {
		audioWorkletNode.port.postMessage({
			type: 'sustain',
			value: event
		});
	}

	// Socket.IO 4.x: emit event to server
	socket.emit('note:sustain', {
		keyId : event.keyId,
		hz : event.hz,
		volume : event.volume
	});
});

keyBoard.setGenerator(generator);

// Audio processors (legacy - now handled in AudioWorklet)
//var multiDelay = new MultiDelay(sampleRate*5, sampleRate*0.5, 0.9, 0.4);
//var reverb = new Reverb(sampleRate*5, 3000, 0.9, 0.4, 0.9, 8000);
var volume = new Volume(0.8);

// Initialize audio on user interaction (required by modern browsers)
document.addEventListener('DOMContentLoaded', function() {
	// Modern browsers require user interaction before audio can start
	var startButton = document.createElement('button');
	startButton.id = 'startAudio';
	startButton.textContent = 'Start Audio';
	startButton.style.cssText = 'position: fixed; top: 10px; right: 10px; z-index: 1000; padding: 10px 20px; font-size: 16px; cursor: pointer;';
	document.body.appendChild(startButton);

	startButton.addEventListener('click', async function() {
		await initAudio();
		startButton.style.display = 'none';
	});

	// Also try to initialize on any key press
	var keyPressHandler = async function() {
		if (!audioContext) {
			await initAudio();
			startButton.style.display = 'none';
		}
		document.removeEventListener('keydown', keyPressHandler);
	};
	document.addEventListener('keydown', keyPressHandler);
});