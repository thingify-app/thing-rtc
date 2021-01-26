import { generateToken, SignallingServer } from 'thingrtc-peer';

const server = new SignallingServer({serverUrl: 'ws://localhost:8080/'});

const initiatorRadio = document.getElementById('initiator') as HTMLInputElement;
const responderIdText = document.getElementById('responderId') as HTMLInputElement;
const connectButton = document.getElementById('connectButton') as HTMLButtonElement;
const disconnectButton = document.getElementById('disconnectButton') as HTMLButtonElement;
const remoteVideo = document.getElementById('remoteVideo') as HTMLVideoElement;

disconnectButton.disabled = true;

connectButton.addEventListener('click', () => {
    connectButton.disabled = true;
    disconnectButton.disabled = false;
    const role = initiatorRadio.checked ? 'initiator' : 'responder';
    const token = generateToken(role, responderIdText.value);
    connect(role, token);
});

disconnectButton.addEventListener('click', () => {
    connectButton.disabled = false;
    disconnectButton.disabled = true;
    disconnect();
});

function connect(role: 'initiator' | 'responder', token: string) {
    server.connect(token);
    const peerTasks = role === 'initiator' ? new InitiatorPeerTasks(server) : new ResponderPeerTasks(server);

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
}

interface PeerTasks {
    onPeerConnect(): void;
    onIceCandidate(candidate: RTCIceCandidate): void;
    onOffer(offer: RTCSessionDescriptionInit): void;
    onAnswer(answer: RTCSessionDescriptionInit): void;
    onPeerDisconnect(): void;
}

class BasePeerTasks implements PeerTasks {
    protected peerConnection: RTCPeerConnection;

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

        peerConnection.addEventListener('track', event => {
            console.log(`Got remote track: ${event.streams[0]}`);
            event.streams[0].getTracks().forEach(track => {
                remoteStream.addTrack(track);
            });
        });

        const dataChannel = peerConnection.createDataChannel('dataChannel');
        dataChannel.addEventListener('message', event => {
            console.log(`Message received: ${event.data}`);
        });

        peerConnection.addEventListener('icecandidate', event => {
            if (event.candidate) {
                console.log(`Got candidate: ${event.candidate}`);
                this.server.sendIceCandidate(event.candidate);
            }
        });

        return peerConnection;
    }
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
}

class ResponderPeerTasks extends BasePeerTasks {
    onPeerConnect(): void {
        super.onPeerConnect();
    }

    onOffer(offer: RTCSessionDescriptionInit): void {
        this.peerConnection.setRemoteDescription(offer);
    }
}
