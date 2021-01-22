import { SignallingConnection, SignallingServer } from 'thingrtc-peer';

const initiatorRadio = document.getElementById('initiator') as HTMLInputElement;
const responderIdText = document.getElementById('responderId') as HTMLInputElement;
const connectButton = document.getElementById('connectButton') as HTMLButtonElement;
const disconnectButton = document.getElementById('disconnectButton') as HTMLButtonElement;
const remoteVideo = document.getElementById('remoteVideo') as HTMLVideoElement;

disconnectButton.disabled = true;

connectButton.addEventListener('click', () => {
    const role = initiatorRadio.checked ? 'initiator' : 'responder';
    alert(`Role: ${role}, ResponderId: ${responderIdText.value}`);
});

disconnectButton.addEventListener('click', disconnect);

async function connect() {
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
            // Send to peer
        }
    });

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    // Send offer to peer

    // Await answer from peer

    // Listen for remote ICE candidates and add to local peerConnection
}

async function doConnect() {
    const server = new SignallingServer({serverHost: 'localhost'});
    const connection = await server.connectAsInitiator('token');
    let peerConnection: RTCPeerConnection = null;
    connection.on('peerConnect', () => {
        // If initiator: create PeerConnection, setup to send ICE candidates, and send offer to peer.
        // If responder: create PeerConnection, and setup to send ICE candidates.
        peerConnection = createPeerConnection(connection);
    });

    connection.on('message', message => {
        // Both: Listen for remote ICE candidate messages
        // If initiator: await answer from peer
        // If responder: await offer from peer
        // Once we reach "connected" state, disconnect from server.
    });

    connection.on('peerDisconnect', () => {
        // If we have not reached "connected" state with peer, tear down PeerConnection and all associated listeners etc.
        // Otherwise, ignore event.
    });

    connection.on('error', () => {
        // This indicates a disconnect from the server (not initiated by us).
        // We should try from the start again if we haven't got a peer connection yet.
    });
}

function createPeerConnection(signallingConnection: SignallingConnection): RTCPeerConnection {
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
            const message = {
                type: 'iceCandidate',
                candidate: event.candidate.toJSON()
            };
            signallingConnection.sendMessage(JSON.stringify(message));
        }
    });

    return peerConnection;
}

function disconnect() {

}

interface PeerTasks {
    onPeerConnect(): void;
    onPeerMessage(message: string): void;
    onPeerDisconnect(): void;
}

class BasePeerTasks implements PeerTasks {

    constructor(private connection: SignallingConnection) {}

    onPeerConnect(): void {
        throw new Error('Method not implemented.');
    }
    onPeerMessage(message: string): void {
        throw new Error('Method not implemented.');
    }
    onPeerDisconnect(): void {
        throw new Error('Method not implemented.');
    }

}

class InitiatorPeerTasks implements PeerTasks {
    onPeerConnect(): void {
        throw new Error('Method not implemented.');
    }
    onPeerMessage(message: string): void {
        throw new Error('Method not implemented.');
    }
    onPeerDisconnect(): void {
        throw new Error('Method not implemented.');
    }
}

class ResponderPeerTasks implements PeerTasks {
    onPeerConnect(): void {
        throw new Error('Method not implemented.');
    }
    onPeerMessage(message: string): void {
        throw new Error('Method not implemented.');
    }
    onPeerDisconnect(): void {
        throw new Error('Method not implemented.');
    }

}
