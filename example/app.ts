import { BasicTokenGenerator, ThingPeer } from 'thingrtc-peer';

const initiatorRadio = document.getElementById('initiator') as HTMLInputElement;
const responderRadio = document.getElementById('responder') as HTMLInputElement;
const responderIdText = document.getElementById('responderId') as HTMLInputElement;
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
peer.on('message', message => {
    console.log(`Message received: ${message}`);
});
peer.on('mediaStream', track => {
    console.log('Received track');
    remoteMediaStream.addTrack(track);
    remoteVideo.srcObject = remoteMediaStream;
});

disconnectButton.disabled = true;

connectButton.addEventListener('click', async () => {
    connectButton.disabled = true;
    disconnectButton.disabled = false;
    sendVideoCheckbox.disabled = true;
    initiatorRadio.disabled = true;
    responderRadio.disabled = true;
    responderIdText.disabled = true;

    const sendVideo = sendVideoCheckbox.checked;
    const cameraStream = sendVideo ? await getCamera() : null;
    localVideo.srcObject = cameraStream;
    const role = initiatorRadio.checked ? 'initiator' : 'responder';
    const responderId = responderIdText.value;
    const tokenGenerator = new BasicTokenGenerator(role, responderId);
    const mediaStreams = cameraStream ? [cameraStream] : [];
    peer.connect(role, responderIdText.value, tokenGenerator, mediaStreams);
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
