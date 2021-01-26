import { BasicTokenGenerator, SignallingServer } from 'thingrtc-peer';

const server = new SignallingServer({serverUrl: 'ws://localhost:8080/'});
let peerTasks: PeerTasks;

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
    connect(role, responderIdText.value);
});

disconnectButton.addEventListener('click', () => {
    connectButton.disabled = false;
    disconnectButton.disabled = true;
    disconnect();
});

sendMessageButton.addEventListener('click', () => {
    peerTasks?.sendMessage(messageText.value);
});

function connect(role: 'initiator' | 'responder', responderId: string) {
    const tokenGenerator = new BasicTokenGenerator(role, responderId);
    server.connect(tokenGenerator);
    peerTasks = role === 'initiator' ? new InitiatorPeerTasks(server) : new ResponderPeerTasks(server);

    server.on('peerConnect', () => {
        peerTasks.onPeerConnect();
    });

    server.on('iceCandidate', iceCandidate => {
        peerTasks.onIceCandidate(iceCandidate);
    });

    server.on('offer', offer => {
        peerTasks.onOffer(offer);
    });

    server.on('answer', answer => {
        peerTasks.onAnswer(answer);
    });

    server.on('peerDisconnect', () => {
        // If we have not reached "connected" state with peer, tear down PeerConnection and all associated listeners etc.
        // Otherwise, ignore event.
        peerTasks.onPeerDisconnect();
    });

    server.on('error', () => {
        // This indicates a disconnect from the server (not initiated by us).
        // We should try from the start again if we haven't got a peer connection yet.
    });
}

function disconnect() {
    server.disconnect();
    peerTasks.disconnect();
}

interface PeerTasks {
    onPeerConnect(): void;
    onIceCandidate(candidate: RTCIceCandidate): void;
    onOffer(offer: RTCSessionDescriptionInit): void;
    onAnswer(answer: RTCSessionDescriptionInit): void;
    onPeerDisconnect(): void;

    sendMessage(message: string): void;
    disconnect(): void;
}

abstract class BasePeerTasks implements PeerTasks {
    protected peerConnection: RTCPeerConnection;
    protected dataChannel: RTCDataChannel;

    constructor(protected server: SignallingServer) {}

    onPeerConnect(): void {
        this.peerConnection = this.createPeerConnection();
        // Once we have reached peer connected state, we should disconnect from server.
        this.peerConnection.addEventListener('connectionstatechange', event => {
            if (this.peerConnection.connectionState === 'connected') {
                this.server.disconnect();
            }
        });
    }

    onIceCandidate(candidate: RTCIceCandidate): void {
        this.peerConnection.addIceCandidate(candidate);
    }

    onOffer(offer: RTCSessionDescriptionInit): void {}

    onAnswer(answer: RTCSessionDescriptionInit): void {}

    onPeerDisconnect(): void {
        if (this.peerConnection.connectionState !== 'connected') {
            this.peerConnection.close();
            this.peerConnection = null;
        }
    }

    sendMessage(message: string): void {
        this.dataChannel?.send(message);
    }

    disconnect(): void {
        this.dataChannel?.close();
        this.peerConnection?.close();
        this.dataChannel = null;
        this.peerConnection = null;
    }

    private createPeerConnection(): RTCPeerConnection {
        const config: RTCConfiguration = {
            iceServers: [
                {
                    urls: [
                        'stun:stun1.l.google.com:19302',
                        'stun:stun2.l.google.com:19302'
                    ]
                }
            ]
        };

        const peerConnection = new RTCPeerConnection(config);
        peerConnection.addTransceiver('video');

        const remoteStream = new MediaStream();
        remoteVideo.srcObject = remoteStream;

        this.setupDataChannel(peerConnection);

        peerConnection.addEventListener('icecandidate', event => {
            if (event.candidate) {
                console.log(`Got candidate: ${event.candidate}`);
                this.server.sendIceCandidate(event.candidate);
            }
        });

        return peerConnection;
    }

    protected abstract setupDataChannel(peerConnection: RTCPeerConnection): void;
}

class InitiatorPeerTasks extends BasePeerTasks {
    onPeerConnect(): void {
        super.onPeerConnect();
        this.peerConnection.createOffer().then(offer => {
            this.peerConnection.setLocalDescription(offer);
            this.server.sendOffer(offer);
        });
    }

    onAnswer(answer: RTCSessionDescriptionInit): void {
        this.peerConnection.setRemoteDescription(answer);
    }

    protected setupDataChannel(peerConnection: RTCPeerConnection) {
        this.dataChannel = peerConnection.createDataChannel('dataChannel');
        this.dataChannel.addEventListener('message', event => {
            console.log(`Message received: ${event.data}`);
        });
    }
}

class ResponderPeerTasks extends BasePeerTasks {
    onPeerConnect(): void {
        super.onPeerConnect();
    }

    onOffer(offer: RTCSessionDescriptionInit): void {
        this.peerConnection.setRemoteDescription(offer);
        this.peerConnection.createAnswer().then(answer => {
            this.peerConnection.setLocalDescription(answer);
            this.server.sendAnswer(answer);
        });
    }

    protected setupDataChannel(peerConnection: RTCPeerConnection) {
        peerConnection.addEventListener('datachannel', event => {
            this.dataChannel = event.channel;
            this.dataChannel.addEventListener('message', event => {
                console.log(`Message received: ${event.data}`);
            });
        });
    }
}
