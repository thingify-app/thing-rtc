import { createInitiatorConfig, createResponderConfig, InsecureServerAuth, PeerConfig, ThingPeer } from 'thingrtc-peer';

const initiatorRadio = document.getElementById('initiator') as HTMLInputElement;
const responderRadio = document.getElementById('responder') as HTMLInputElement;

const initiatorBox = document.getElementById('initiatorBox') as HTMLDivElement;
const responderBox = document.getElementById('responderBox') as HTMLDivElement;

const createSharedSecretButton = document.getElementById('createSharedSecretButton') as HTMLButtonElement;
const sharedSecretBox = document.getElementById('sharedSecret') as HTMLDivElement;

const sharedSecretInput = document.getElementById('sharedSecretInput') as HTMLInputElement;
const loadSharedSecretButton = document.getElementById('loadSharedSecretButton') as HTMLButtonElement;
const responderStatusBox = document.getElementById('responderStatus') as HTMLDivElement;;

const sendVideoCheckbox = document.getElementById('sendVideo') as HTMLInputElement;
const connectButton = document.getElementById('connectButton') as HTMLButtonElement;
const disconnectButton = document.getElementById('disconnectButton') as HTMLButtonElement;

const messageText = document.getElementById('message') as HTMLInputElement;
const sendMessageButton = document.getElementById('sendMessageButton') as HTMLButtonElement;

const localVideo = document.getElementById('localVideo') as HTMLVideoElement;
const remoteVideo = document.getElementById('remoteVideo') as HTMLVideoElement;

const remoteMediaStream = new MediaStream();

const localhost = location.hostname === 'localhost';
const signallingServer = localhost ? `ws://localhost:8000/signalling` : `wss://thingify.deno.dev/signalling`;

let peerConfig: PeerConfig|null = null;
let peer: ThingPeer|null = null;

disconnectButton.disabled = true;
initiatorBox.style.display = 'block';
responderBox.style.display = 'none';


initiatorRadio.addEventListener('change', () => {
    if (initiatorRadio.checked) {
        initiatorBox.style.display = 'block';
        responderBox.style.display = 'none';
    }
});

responderRadio.addEventListener('change', () => {
    if (responderRadio.checked) {
        initiatorBox.style.display = 'none';
        responderBox.style.display = 'block';
    }
});

createSharedSecretButton.addEventListener('click', async () => {
    createSharedSecretButton.disabled = true;
    initiatorRadio.disabled = true;
    responderRadio.disabled = true;

    const sharedSecretConfig = await createInitiatorConfig();
    peerConfig = sharedSecretConfig.peerConfig;

    sharedSecretBox.innerText = `${sharedSecretConfig.secretBase64}`;

    createSharedSecretButton.disabled = false;
    initiatorRadio.disabled = false;
    responderRadio.disabled = false;
});

loadSharedSecretButton.addEventListener('click', async () => {
    sharedSecretInput.disabled = true;
    loadSharedSecretButton.disabled = true;
    initiatorRadio.disabled = true;
    responderRadio.disabled = true;

    const sharedSecret = sharedSecretInput.value;
    try {
        peerConfig = await createResponderConfig(sharedSecret);
        responderStatusBox.innerText = `Loaded shared secret with pairingId: ${peerConfig.pairingId}`;
    } catch (e) {
        alert('Failed to load shared secret: ' + e);
    }

    sharedSecretInput.disabled = false;
    loadSharedSecretButton.disabled = false;
    initiatorRadio.disabled = false;
    responderRadio.disabled = false;
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
    peer.on('binaryMessage', message => {
        console.log('Binary message received:');
        console.log(message);
    });
    peer.on('mediaStream', track => {
        console.log('Received track');
        remoteMediaStream.addTrack(track);
        remoteVideo.srcObject = remoteMediaStream;
    });

    return peer;
}
