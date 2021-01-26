import { BasicTokenGenerator, ThingPeer } from 'thingrtc-peer';

const peer = new ThingPeer('ws://localhost:8080/');
peer.on('message', message => {
    console.log(`Message received: ${message}`);
});

const initiatorRadio = document.getElementById('initiator') as HTMLInputElement;
const responderIdText = document.getElementById('responderId') as HTMLInputElement;
const connectButton = document.getElementById('connectButton') as HTMLButtonElement;
const disconnectButton = document.getElementById('disconnectButton') as HTMLButtonElement;
const messageText = document.getElementById('message') as HTMLInputElement;
const sendMessageButton = document.getElementById('sendMessageButton') as HTMLButtonElement;
const remoteVideo = document.getElementById('remoteVideo') as HTMLVideoElement;

disconnectButton.disabled = true;

connectButton.addEventListener('click', () => {
    connectButton.disabled = true;
    disconnectButton.disabled = false;
    const role = initiatorRadio.checked ? 'initiator' : 'responder';
    const responderId = responderIdText.value;
    const tokenGenerator = new BasicTokenGenerator(role, responderId);
    peer.connect(role, responderIdText.value, tokenGenerator);
});

disconnectButton.addEventListener('click', () => {
    connectButton.disabled = false;
    disconnectButton.disabled = true;
    peer.disconnect();
});

sendMessageButton.addEventListener('click', () => {
    peer.sendMessage(messageText.value);
});
