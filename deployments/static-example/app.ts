import { createInitiatorConfig, createResponderConfig, InsecureServerAuth, PeerConfig, ThingPeer } from 'thingrtc-peer';
import { BrowserQRCodeReader, BrowserQRCodeSvgWriter, IScannerControls } from '@zxing/browser';

const initiatorRadio = document.getElementById('initiator') as HTMLInputElement;
const responderRadio = document.getElementById('responder') as HTMLInputElement;

const initiatorBox = document.getElementById('initiatorBox') as HTMLDivElement;
const responderBox = document.getElementById('responderBox') as HTMLDivElement;

const createSharedSecretButton = document.getElementById('createSharedSecretButton') as HTMLButtonElement;
const sharedSecretBox = document.getElementById('sharedSecret') as HTMLDivElement;

const qrCodeVideo = document.getElementById('qrCodeVideo') as HTMLVideoElement;
const responderStatusBox = document.getElementById('responderStatus') as HTMLDivElement;;

const sendVideoCheckbox = document.getElementById('sendVideo') as HTMLInputElement;
const connectButton = document.getElementById('connectButton') as HTMLButtonElement;
const disconnectButton = document.getElementById('disconnectButton') as HTMLButtonElement;

const messageText = document.getElementById('message') as HTMLInputElement;
const sendMessageButton = document.getElementById('sendMessageButton') as HTMLButtonElement;

const startSpeedTestButton = document.getElementById('startSpeedTestButton') as HTMLButtonElement;
const stopSpeedTestButton = document.getElementById('stopSpeedTestButton') as HTMLButtonElement;
const receivedBytesBox = document.getElementById('receivedBytes') as HTMLDivElement;
const sentBytesBox = document.getElementById('sentBytes') as HTMLDivElement;

const localVideo = document.getElementById('localVideo') as HTMLVideoElement;
const remoteVideo = document.getElementById('remoteVideo') as HTMLVideoElement;

const remoteMediaStream = new MediaStream();

const localhost = location.hostname === 'localhost';
const signallingServer = localhost ? `ws://localhost:8000/signalling` : `wss://dev.thingify.app/signalling`;

let peerConfig: PeerConfig|null = null;
let peer: ThingPeer|null = null;

let qrScannerControl: IScannerControls|null = null;

let speedTestActive = false;

disconnectButton.disabled = true;
initiatorBox.style.display = 'block';
responderBox.style.display = 'none';
qrCodeVideo.style.display = 'none';

stopSpeedTestButton.disabled = true;

// Create initial QR code:
setupInitiator();

initiatorRadio.addEventListener('change', async () => {
    if (initiatorRadio.checked) {
        initiatorBox.style.display = 'block';
        responderBox.style.display = 'none';
        qrScannerControl?.stop();
        await setupInitiator();
    }
});

responderRadio.addEventListener('change', async () => {
    if (responderRadio.checked) {
        initiatorBox.style.display = 'none';
        responderBox.style.display = 'block';
        
        await setupResponder();
    }
});

connectButton.addEventListener('click', async () => {
    if (peer) {
        alert('Peer already exists - disconnect first');
        return;
    }

    if (!peerConfig) {
        alert('Peer not configured!');
        return;
    }

    peer = createPeer(peerConfig);

    connectButton.disabled = true;
    disconnectButton.disabled = false;
    sendVideoCheckbox.disabled = true;
    initiatorRadio.disabled = true;
    responderRadio.disabled = true;

    const sendVideo = sendVideoCheckbox.checked;
    const cameraStream = sendVideo ? await getCamera() : null;
    localVideo.srcObject = cameraStream;
    const mediaStreams = cameraStream ? [cameraStream] : [];

    peer.connect(mediaStreams);
});

disconnectButton.addEventListener('click', () => {
    connectButton.disabled = false;
    disconnectButton.disabled = true;
    sendVideoCheckbox.disabled = false;
    initiatorRadio.disabled = false;
    responderRadio.disabled = false;
    peer?.disconnect();
    peer = null;
});

sendMessageButton.addEventListener('click', () => {
    peer?.sendMessage(messageText.value);
});

startSpeedTestButton.addEventListener('click', () => {
    speedTestActive = true;
    startSpeedTestButton.disabled = true;
    stopSpeedTestButton.disabled = false;

    const messageBuffer = new Uint8Array(16384);
    let bytesSent = 0;
    let measureStartTime = Date.now();

    const sendFn = () => {
        crypto.getRandomValues(messageBuffer);
        peer?.sendMessage(messageBuffer.buffer);
        bytesSent += messageBuffer.byteLength;

        const currentTime = Date.now();
        const elapsedTime = currentTime - measureStartTime;
        if (elapsedTime >= 1000) {
            const bytesPerSec = bytesSent / (elapsedTime / 1000);
            sentBytesBox.innerText = `Sending: ${formatBps(bytesPerSec)}`;
            bytesSent = 0;
            measureStartTime = currentTime;
        }

        if (speedTestActive) {
            // Queue up another send, allowing the browser event loop to
            // execute in between.
            setTimeout(sendFn, 0);
        }
    };

    sendFn();
});

stopSpeedTestButton.addEventListener('click', () => {
    speedTestActive = false;
    startSpeedTestButton.disabled = false;
    stopSpeedTestButton.disabled = true;
});

async function setupInitiator() {
    const sharedSecretConfig = await createInitiatorConfig();
    peerConfig = sharedSecretConfig.peerConfig;

    const qrCodeWriter = new BrowserQRCodeSvgWriter();
    sharedSecretBox.innerHTML = '';
    qrCodeWriter.writeToDom(sharedSecretBox, sharedSecretConfig.secretBase64, 256, 256);
}

async function setupResponder() {
    qrCodeVideo.style.display = 'block';

    const qrCodeReader = new BrowserQRCodeReader();
    qrScannerControl = await qrCodeReader.decodeFromVideoDevice(undefined, qrCodeVideo, async (result, err) => {
        if (!err) {
            const sharedSecret = result?.getText()!;
            try {
                peerConfig = await createResponderConfig(sharedSecret);
                qrCodeVideo.style.display = 'none';
                responderStatusBox.innerText = `Loaded shared secret.`;
                qrScannerControl?.stop();
            } catch (e) {
                alert('Failed to load shared secret: ' + e);
            }
        }
    });
}

async function getCamera(): Promise<MediaStream> {
    return await navigator.mediaDevices?.getUserMedia({video: true});
}

function createPeer(peerConfig: PeerConfig): ThingPeer {
    const serverAuth = new InsecureServerAuth(peerConfig.pairingId, peerConfig.role);
    const peer = new ThingPeer(signallingServer, serverAuth, peerConfig);

    peer.on('connectionStateChanged', state => {
        console.log(`Peer connection state: ${state}`);
        if (state === 'disconnected') {
            remoteMediaStream.getTracks().forEach(track => remoteMediaStream.removeTrack(track));
        }
    });

    peer.on('stringMessage', message => {
        console.log(`String message received: ${message}`);
    });

    // Using binary messages for speed test:
    let bytesReceived = 0;
    let measureStartTime = Date.now();
    peer.on('binaryMessage', message => {
        bytesReceived += message.byteLength;

        const currentTime = Date.now();
        const elapsedTime = currentTime - measureStartTime;
        if (elapsedTime >= 1000) {
            const bytesPerSec = bytesReceived / (elapsedTime / 1000);
            receivedBytesBox.innerText = `Received: ${formatBps(bytesPerSec)}`;
            bytesReceived = 0;
            measureStartTime = currentTime;
        }
    });

    peer.on('mediaStream', track => {
        console.log('Received track');
        remoteMediaStream.addTrack(track);
        remoteVideo.srcObject = remoteMediaStream;
    });

    return peer;
}

function formatBps(bytesPerSec: number): string {
    const bitsPerSec = bytesPerSec * 8;
    if (bitsPerSec >= 1_000_000) {
        return `${(bitsPerSec / 1_000_000).toFixed(2)}Mbps`;
    } else if (bitsPerSec >= 1000) {
        return `${(bitsPerSec / 1000).toFixed(2)}kbps`;
    } else {
        return `${bitsPerSec.toFixed(2)}bps`;
    }
}
