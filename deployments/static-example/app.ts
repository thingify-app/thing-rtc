import { createInitiatorConfig, createInitiatorConfigWithSecret, createResponderConfig, InsecureServerAuth, PeerConfig, SharedSecretConfig, ThingPeer } from 'thingrtc-peer';
import { BrowserQRCodeReader, BrowserQRCodeSvgWriter, IScannerControls } from '@zxing/browser';

const initiatorRadio = document.getElementById('initiator') as HTMLInputElement;
const responderRadio = document.getElementById('responder') as HTMLInputElement;

const initiatorBox = document.getElementById('initiatorBox') as HTMLDivElement;
const responderBox = document.getElementById('responderBox') as HTMLDivElement;

const sharedSecretBox = document.getElementById('sharedSecret') as HTMLDivElement;

const responderSharedSecretText = document.getElementById('responderSharedSecret') as HTMLInputElement;
const setSharedSecretButton = document.getElementById('setSharedSecretButton') as HTMLButtonElement;
const qrCodeVideo = document.getElementById('qrCodeVideo') as HTMLVideoElement;
const responderStatusBox = document.getElementById('responderStatus') as HTMLDivElement;;

const saveConfigButton = document.getElementById('saveConfigButton') as HTMLButtonElement;
const clearConfigButton = document.getElementById('clearConfigButton') as HTMLButtonElement;

const sendVideoCheckbox = document.getElementById('sendVideo') as HTMLInputElement;
const connectButton = document.getElementById('connectButton') as HTMLButtonElement;
const disconnectButton = document.getElementById('disconnectButton') as HTMLButtonElement;

const messageText = document.getElementById('message') as HTMLInputElement;
const sendMessageButton = document.getElementById('sendMessageButton') as HTMLButtonElement;

const startSpeedTestButton = document.getElementById('startSpeedTestButton') as HTMLButtonElement;
const stopSpeedTestButton = document.getElementById('stopSpeedTestButton') as HTMLButtonElement;
const receivedBytesBox = document.getElementById('receivedBytes') as HTMLDivElement;
const sentBytesBox = document.getElementById('sentBytes') as HTMLDivElement;

const fileUpload = document.getElementById('fileUpload') as HTMLInputElement;
const receiveFileButton = document.getElementById('receiveFileButton') as HTMLButtonElement;
const finishReceiveFileButton = document.getElementById('finishReceiveFileButton') as HTMLButtonElement;
const fileTransferStatusBox = document.getElementById('fileTransferStatus') as HTMLDivElement;

const localVideo = document.getElementById('localVideo') as HTMLVideoElement;
const remoteVideo = document.getElementById('remoteVideo') as HTMLVideoElement;

const remoteMediaStream = new MediaStream();

const localhost = location.hostname === 'localhost';
const signallingServer = localhost ? `ws://localhost:8000/signalling` : `wss://dev.thingify.app/signalling`;

const sharedSecretStorageKey = 'SHARED_SECRET_STORAGE';

let sharedSecretConfig: SharedSecretConfig|null = null;
let peer: ThingPeer|null = null;

let qrScannerControl: IScannerControls|null = null;

let speedTestActive = false;
let savingFile: WritableStreamDefaultWriter|null = null;
let receivedFileBytes = 0;

disconnectButton.disabled = true;
initiatorBox.style.display = 'block';
responderBox.style.display = 'none';
qrCodeVideo.style.display = 'none';

stopSpeedTestButton.disabled = true;
finishReceiveFileButton.disabled = true;

setup();

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

setSharedSecretButton.addEventListener('click', async () => {
    const peerConfig = await createResponderConfig(responderSharedSecretText.value);
    sharedSecretConfig = {
        peerConfig,
        secretBase64: responderSharedSecretText.value,
    };
});

saveConfigButton.addEventListener('click', async () => {
    if (!sharedSecretConfig) {
        alert('No peer config set!');
    }
    window.localStorage.setItem(sharedSecretStorageKey, sharedSecretConfig!.secretBase64);

    // Reload UI to show config:
    await setup();
});

clearConfigButton.addEventListener('click', async () => {
    window.localStorage.removeItem(sharedSecretStorageKey);
    sharedSecretConfig = null;

    // Reload UI to show config:
    await setup();
});

connectButton.addEventListener('click', async () => {
    if (peer) {
        alert('Peer already exists - disconnect first');
        return;
    }

    if (!sharedSecretConfig) {
        alert('Peer not configured!');
        return;
    }

    peer = createPeer(sharedSecretConfig.peerConfig);

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

    const sendFn = async () => {
        crypto.getRandomValues(messageBuffer);
        await peer?.sendMessage(messageBuffer.buffer);
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

fileUpload.addEventListener('change', async () => {
    const files = fileUpload.files;
    console.log(files);
    if (!files || files.length !== 1) {
        alert('Unexpected number of files selected!');
        return;
    }

    const fileReader = files[0].stream().getReader();
    while (true) {
        const chunk = await fileReader.read();
        if (chunk.done) {
            break;
        }

        const chunkLength = chunk.value.byteLength;
        console.log(chunkLength);

        const SUB_CHUNK_SIZE = 16384;
        for (let i = 0; i < chunkLength; i += SUB_CHUNK_SIZE) {
            const subChunk = chunk.value.buffer.slice(i, Math.min(i + SUB_CHUNK_SIZE, chunkLength));
            console.log(`Sending subchunk of length ${subChunk.byteLength}`);
            await peer?.sendMessage(subChunk);
        }
    }
});

receiveFileButton.addEventListener('click', async () => {
    const handle = await window.showSaveFilePicker({suggestedName: 'download.dat'});
    savingFile = (await handle.createWritable()).getWriter();

    receivedFileBytes = 0;
    receiveFileButton.disabled = true;
    finishReceiveFileButton.disabled = false;
});

finishReceiveFileButton.addEventListener('click', async () => {
    await savingFile?.close();
    savingFile = null;
    alert('File written');
    receiveFileButton.disabled = false;
    finishReceiveFileButton.disabled = true;
});

async function setup() {
    if (initiatorRadio.checked) {
        await setupInitiator();
    } else {
        await setupResponder();
    }
}

async function setupInitiator() {
    const sharedSecret = loadSharedSecret();

    if (sharedSecret) {
        const peerConfig = await createInitiatorConfigWithSecret(sharedSecret);
        sharedSecretConfig = {
            peerConfig,
            secretBase64: sharedSecret,
        };
    } else {
        sharedSecretConfig = await createInitiatorConfig();
    }

    const qrCodeWriter = new BrowserQRCodeSvgWriter();
    sharedSecretBox.innerHTML = '';
    qrCodeWriter.writeToDom(sharedSecretBox, sharedSecretConfig.secretBase64, 256, 256);
    sharedSecretBox.appendChild(document.createTextNode(sharedSecretConfig.secretBase64));
}

async function setupResponder() {
    const sharedSecret = loadSharedSecret();

    if (sharedSecret) {
        await loadResponderConfig(sharedSecret);
    } else {
        qrCodeVideo.style.display = 'block';
        const qrCodeReader = new BrowserQRCodeReader();
        qrScannerControl = await qrCodeReader.decodeFromVideoDevice(undefined, qrCodeVideo, async (result, err) => {
            if (!err) {
                const sharedSecret = result?.getText()!;
                try {
                    await loadResponderConfig(sharedSecret);                    
                } catch (e) {
                    alert('Failed to load shared secret: ' + e);
                }
            }
        });
    }
}

async function loadResponderConfig(sharedSecret: string) {
    const peerConfig = await createResponderConfig(sharedSecret);
    sharedSecretConfig = {
        peerConfig,
        secretBase64: sharedSecret,
    };
    qrCodeVideo.style.display = 'none';
    responderStatusBox.innerText = `Loaded shared secret.`;
    qrScannerControl?.stop();
}

function loadSharedSecret(): string|null {
    return window.localStorage.getItem(sharedSecretStorageKey);
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
    peer.on('binaryMessage', async message => {
        if (savingFile) {
            await savingFile.write(message);
        }

        bytesReceived += message.byteLength;
        receivedFileBytes += message.byteLength;

        const currentTime = Date.now();
        const elapsedTime = currentTime - measureStartTime;
        if (elapsedTime >= 1000) {
            const bytesPerSec = bytesReceived / (elapsedTime / 1000);
            receivedBytesBox.innerText = `Received: ${formatBps(bytesPerSec)}`;
            bytesReceived = 0;
            measureStartTime = currentTime;

            fileTransferStatusBox.innerText = `Received ${formatSIPrefix(receivedFileBytes)}B of file.`;
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
    return `${formatSIPrefix(bitsPerSec)}bps`;
}

function formatSIPrefix(value: number): string {
    if (value >= 1_000_000) {
        return `${(value / 1_000_000).toFixed(2)}M`;
    } else if (value >= 1000) {
        return `${(value / 1000).toFixed(2)}k`;
    } else {
        return value.toFixed(2);
    }
}
