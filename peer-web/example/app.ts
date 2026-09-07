import { InsecureServerAuth, Listeners, LocalKeyPair, PeerConfig, RemoteKey, ThingPeer, KeyPair } from 'thingrtc-peer';

const initiatorRadio = document.getElementById('initiator') as HTMLInputElement;
const responderRadio = document.getElementById('responder') as HTMLInputElement;

const localPublicKeyBox = document.getElementById('localPublicKey') as HTMLDivElement;

const peerPublicKeyText = document.getElementById('peerPublicKey') as HTMLInputElement;
const addPeerPublicKeyButton = document.getElementById('addPeerPublicKey') as HTMLButtonElement;
const resetLocalKeyButton = document.getElementById('resetLocalKeyButton') as HTMLButtonElement;
const remoteKeysList = document.getElementById('remoteKeysList') as HTMLUListElement;
const deletePeerPublicKeyButton = document.getElementById('deletePeerPublicKey') as HTMLButtonElement;

const sendVideoCheckbox = document.getElementById('sendVideo') as HTMLInputElement;
const connectButton = document.getElementById('connectButton') as HTMLButtonElement;
const disconnectButton = document.getElementById('disconnectButton') as HTMLButtonElement;

const dataChannelList = document.getElementById('dataChannelList') as HTMLDivElement;
const dataChannelLabel = document.getElementById('dataChannelLabel') as HTMLInputElement;
const createDataChannelButton = document.getElementById('createDataChannelButton') as HTMLButtonElement;

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
const signallingServer = localhost ? `ws://localhost:8787/signalling` : `wss://signalling.thingify.app/signalling`;

const PEER_KEY_STORAGE_KEY = 'PEER_PUBLIC_KEYS';

let localKeyPair: LocalKeyPair|null = null;
let remoteKeys: RemoteKey[] = [];
let peer: ThingPeer|null = null;

let speedTestActive = false;
let receivedFileBytes = 0;

disconnectButton.disabled = true;
stopSpeedTestButton.disabled = true;

setup();

resetLocalKeyButton.addEventListener('click', async () => {
    await LocalKeyPair.clearLocalKeyPair();
    await setup();
});

addPeerPublicKeyButton.addEventListener('click', async () => {
    try {
        remoteKeys.push(await RemoteKey.createRemoteKey(peerPublicKeyText.value));
        await saveRemoteKeys();
    } catch (e) {
        alert(`Error saving key: ${e}`);
    }
});

deletePeerPublicKeyButton.addEventListener('click', async () => {
    const selectedRemoteKey = document.querySelector('input[name="remoteKeys"]:checked') as HTMLInputElement|null;
    if (selectedRemoteKey) {
        remoteKeys = remoteKeys.filter(key => key.publicKeySpki !== selectedRemoteKey.value);
        await saveRemoteKeys();
    }
});

connectButton.addEventListener('click', async () => {
    if (peer) {
        alert('Peer already exists - disconnect first');
        return;
    }

    const selectedRemoteKey = document.querySelector('input[name="remoteKeys"]:checked') as HTMLInputElement|null;
    if (!selectedRemoteKey) {
        alert('No remote key selected!');
        return;
    }

    const role = initiatorRadio.checked ? 'initiator' : 'responder';
    const remoteKey = await RemoteKey.createRemoteKey(selectedRemoteKey.value);
    const peerConfig = await KeyPair.createConfig(remoteKey, localKeyPair!, role);

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

createDataChannelButton.addEventListener('click', async () => {
    const label = dataChannelLabel.value;
    if (label.length > 0) {
        await peer?.createDataChannel(label, true);
        dataChannelLabel.value = '';
        reloadDataChannels();
    }
});

sendMessageButton.addEventListener('click', async () => {
    const selectedDataChannel = document.querySelector('input[name="dataChannels"]:checked') as HTMLInputElement;
    if (selectedDataChannel) {
        const dc = peer?.getDataChannel(selectedDataChannel.value);
        await dc?.sendMessage(messageText.value);
        console.log(`Sent message on channel ${dc?.getLabel()}`);
    }
});

startSpeedTestButton.addEventListener('click', async () => {
    speedTestActive = true;
    startSpeedTestButton.disabled = true;
    stopSpeedTestButton.disabled = false;

    const dc = await peer?.createDataChannel('speedtest', true);
    console.log('Data channel created.');

    const messageBuffer = new Uint8Array(16384);
    let bytesSent = 0;
    let measureStartTime = Date.now();

    while (speedTestActive) {
        crypto.getRandomValues(messageBuffer);
        await dc?.sendMessage(messageBuffer.buffer);
        bytesSent += messageBuffer.byteLength;

        const currentTime = Date.now();
        const elapsedTime = currentTime - measureStartTime;
        if (elapsedTime >= 1000) {
            const bytesPerSec = bytesSent / (elapsedTime / 1000);
            sentBytesBox.innerText = `Sending: ${formatBps(bytesPerSec)}`;
            bytesSent = 0;
            measureStartTime = currentTime;
        }
    };
});

stopSpeedTestButton.addEventListener('click', () => {
    speedTestActive = false;
    startSpeedTestButton.disabled = false;
    stopSpeedTestButton.disabled = true;
});

async function setup() {
    const loaded = await LocalKeyPair.loadLocalKeyPair();
    if (loaded) {
        localKeyPair = loaded;
    } else {
        localKeyPair = await LocalKeyPair.createLocalKeyPair();
        await localKeyPair.save();
    }
    localPublicKeyBox.innerHTML = '';
    localPublicKeyBox.appendChild(document.createTextNode(localKeyPair.publicKeySpki));

    await loadRemoteKeys();
}

async function loadRemoteKeys() {
    remoteKeys = [];

    const saved = window.localStorage.getItem(PEER_KEY_STORAGE_KEY);
    if (saved) {
        const data = JSON.parse(saved) as string[];
        for (const key of data) {
            const remoteKey = await RemoteKey.createRemoteKey(key);
            remoteKeys.push(remoteKey);
        }
    }

    createRadioButtons(remoteKeysList, 'remoteKeys', remoteKeys.map(key => key.publicKeySpki));
}

async function saveRemoteKeys() {
    const data = JSON.stringify(remoteKeys.map(key => key.publicKeySpki));
    window.localStorage.setItem(PEER_KEY_STORAGE_KEY, data);
    await loadRemoteKeys();
}

async function getCamera(): Promise<MediaStream> {
    return await navigator.mediaDevices?.getUserMedia({video: true});
}

function reloadDataChannels() {
    const dcs = peer?.getDataChannels() ?? [];
    createRadioButtons(dataChannelList, 'dataChannels', dcs.map(dc => dc.getLabel()));
}

function createRadioButtons(parent: HTMLElement, name: string, labels: string[]) {
    parent.innerHTML = '';
    for (const l of labels) {
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = name;
        radio.id = l;
        radio.value = l;
        parent.appendChild(radio);

        const label = document.createElement('label');
        label.setAttribute('for', l);
        label.textContent = l;
        parent.appendChild(label);
    }
}

function createPeer(peerConfig: PeerConfig): ThingPeer {
    const serverAuth = new InsecureServerAuth(peerConfig.pairingId, peerConfig.role);

    // Using binary messages for speed test:
    let bytesReceived = 0;
    let measureStartTime = Date.now();

    const listeners: Listeners = {
        connectionStateListener: state => {
            console.log(`Peer connection state: ${state}`);
            reloadDataChannels();
            if (state === 'disconnected') {
                remoteMediaStream.getTracks().forEach(track => remoteMediaStream.removeTrack(track));
            }
        },

        dataChannelListener: dc => {
            console.log(`New data channel received: ${dc.getLabel()}`);

            dc.on('stringMessage', message => {
                console.log(`String message received from "${dc.getLabel()}": ${message}`);
            });

            dc.on('binaryMessage', message => {
                bytesReceived += message.byteLength;
                receivedFileBytes += message.byteLength;

                const currentTime = Date.now();
                const elapsedTime = currentTime - measureStartTime;
                if (elapsedTime >= 1000) {
                    const bytesPerSec = bytesReceived / (elapsedTime / 1000);
                    receivedBytesBox.innerText = `Received: ${formatBps(bytesPerSec)}`;
                    bytesReceived = 0;
                    measureStartTime = currentTime;
                }
            });

            reloadDataChannels();
        },

        mediaStreamListener: track => {
            console.log('Received track');
            remoteMediaStream.addTrack(track);
            remoteVideo.srcObject = remoteMediaStream;
        }
    };

    return new ThingPeer(signallingServer, serverAuth, peerConfig, listeners);
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
