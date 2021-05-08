import { BasicTokenGenerator, ThingPeer, Pairing, PairingServer } from 'thingrtc-peer';

const initiatorRadio = document.getElementById('initiator') as HTMLInputElement;
const responderRadio = document.getElementById('responder') as HTMLInputElement;
const createPairingBox = document.getElementById('createPairingBox') as HTMLDivElement;
const respondToPairingBox = document.getElementById('respondToPairingBox') as HTMLDivElement;
const createPairingButton = document.getElementById('createPairingButton') as HTMLButtonElement;
const respondToPairingButton = document.getElementById('respondToPairingButton') as HTMLButtonElement;
const pairingShortcodeInput = document.getElementById('pairingShortcodeInput') as HTMLInputElement;
const pairingShortcodeBox = document.getElementById('pairingShortcode') as HTMLDivElement;
const pairingStatusBox = document.getElementById('pairingStatus') as HTMLDivElement;
const pairingList = document.getElementById('pairingList') as HTMLDivElement;
const sendVideoCheckbox = document.getElementById('sendVideo') as HTMLInputElement;
const connectButton = document.getElementById('connectButton') as HTMLButtonElement;
const disconnectButton = document.getElementById('disconnectButton') as HTMLButtonElement;
const messageText = document.getElementById('message') as HTMLInputElement;
const sendMessageButton = document.getElementById('sendMessageButton') as HTMLButtonElement;
const localVideo = document.getElementById('localVideo') as HTMLVideoElement;
const remoteVideo = document.getElementById('remoteVideo') as HTMLVideoElement;

const remoteMediaStream = new MediaStream();

const protocol = location.protocol === 'http:' ? 'ws' : 'wss';
const peer = new ThingPeer(`${protocol}://${location.host}/`);
const pairingServerUrl = `${location.protocol}//${location.hostname}:8081/`;
const pairingServer = new PairingServer(pairingServerUrl);
const pairing = new Pairing(pairingServer);

refreshPairingList();

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

disconnectButton.disabled = true;
createPairingBox.style.display = 'none';
respondToPairingBox.style.display = 'block';

initiatorRadio.addEventListener('change', () => {
    if (initiatorRadio.checked) {
        createPairingBox.style.display = 'none';
        respondToPairingBox.style.display = 'block';
    }
});

responderRadio.addEventListener('change', () => {
    if (responderRadio.checked) {
        createPairingBox.style.display = 'block';
        respondToPairingBox.style.display = 'none';
    }
});

createPairingButton.addEventListener('click', async () => {
    createPairingButton.disabled = true;
    initiatorRadio.disabled = true;
    responderRadio.disabled = true;

    pairingStatusBox.innerText = 'Creating pairing...';
    const pairingDetails = await pairing.initiatePairing();
    pairingShortcodeBox.innerText = `Pairing code: ${pairingDetails.shortcode}`;
    pairingStatusBox.innerText = 'Waiting for peer...';
    try {
        const redemptionResult = await pairingDetails.redemptionResult();
        pairingShortcodeBox.innerText = '';
        pairingStatusBox.innerText = 'Pairing succeeded!';
    } catch (error) {
        console.error(error);
        pairingShortcodeBox.innerText = '';
        pairingStatusBox.innerText = 'Pairing failed, try again.';
    }
    createPairingButton.disabled = false;
    initiatorRadio.disabled = false;
    responderRadio.disabled = false;

    await refreshPairingList();
});

respondToPairingButton.addEventListener('click', async () => {
    pairingShortcodeInput.disabled = true;
    respondToPairingButton.disabled = true;
    initiatorRadio.disabled = true;
    responderRadio.disabled = true;

    const shortcode = pairingShortcodeInput.value;
    try {
        const response = await pairing.respondToPairing(shortcode);
        pairingStatusBox.innerText = 'Pairing succeeded!';
    } catch (error) {
        console.error(error);
        pairingStatusBox.innerText = 'Pairing failed, try again.';
    }

    pairingShortcodeInput.disabled = false;
    respondToPairingButton.disabled = false;
    initiatorRadio.disabled = false;
    responderRadio.disabled = false;

    await refreshPairingList();
});

connectButton.addEventListener('click', async () => {
    connectButton.disabled = true;
    disconnectButton.disabled = false;
    sendVideoCheckbox.disabled = true;
    initiatorRadio.disabled = true;
    responderRadio.disabled = true;

    const sendVideo = sendVideoCheckbox.checked;
    const cameraStream = sendVideo ? await getCamera() : null;
    localVideo.srcObject = cameraStream;
    const role = initiatorRadio.checked ? 'initiator' : 'responder';
    const responderId = '';
    const tokenGenerator = new BasicTokenGenerator(role, responderId);
    const mediaStreams = cameraStream ? [cameraStream] : [];
    peer.connect(role, responderId, tokenGenerator, mediaStreams);
});

disconnectButton.addEventListener('click', () => {
    connectButton.disabled = false;
    disconnectButton.disabled = true;
    peer.disconnect();
});

sendMessageButton.addEventListener('click', () => {
    peer.sendMessage(messageText.value);
});

async function getCamera(): Promise<MediaStream> {
    return await navigator.mediaDevices?.getUserMedia({video: true});
}

async function refreshPairingList(): Promise<void> {
    const pairingIds = await pairing.getAllPairingIds();
    pairingList.innerHTML = `<ul>${pairingIds.map(id => `<li>${id}</li>`).join('')}</ul>`;
}
