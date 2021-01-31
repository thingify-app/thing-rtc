import { SignallingServer } from "./signalling-server";
import { TokenGenerator } from "./token-generator";

/** Wraps the entire process of setting up a P2P connection. */
export class ThingPeer {
    private peerTasks?: PeerTasks;
    private mediaStreamListener?: (mediaStream: MediaStreamTrack) => void;
    private messageListener?: (message: string) => void;

    constructor(private serverUrl: string) {}

    connect(role: 'initiator' | 'responder', responderId: string, tokenGenerator: TokenGenerator, mediaStreams: MediaStream[]) {
        const server = new SignallingServer({serverUrl: this.serverUrl});
        this.peerTasks = role === 'initiator' ? new InitiatorPeerTasks(server, tokenGenerator) : new ResponderPeerTasks(server, tokenGenerator);
        this.peerTasks.mediaStreamListener = this.mediaStreamListener;
        this.peerTasks.messageListener = this.messageListener;
        mediaStreams.forEach(stream => {
            this.peerTasks!.addMediaStream(stream);
        });
    }

    sendMessage(message: string): void {
        this.peerTasks?.sendMessage(message);
    }

    disconnect() {
        this.peerTasks?.disconnect();
    }

    on(type: 'mediaStream', callback: (mediaStream: MediaStreamTrack) => void): void;
    on(type: 'message', callback: (message: string) => void): void;
    on(type: string, callback: any): void {
        switch (type) {
            case 'mediaStream':
                this.mediaStreamListener = callback;
                if (this.peerTasks) {
                    this.peerTasks.mediaStreamListener = callback;
                }
                break;
            case 'message':
                this.messageListener = callback;
                if (this.peerTasks) {
                    this.peerTasks.messageListener = callback;
                }
                break;
            default:
                throw new Error(`Unknown event type: ${type}`);
        }
    }
}

interface PeerTasks {
    mediaStreamListener?: (mediaStream: MediaStreamTrack) => void;
    messageListener?: (message: string) => void;

    onPeerConnect(): void;
    onIceCandidate(candidate: RTCIceCandidate): void;
    onOffer(offer: RTCSessionDescriptionInit): void;
    onAnswer(answer: RTCSessionDescriptionInit): void;
    onPeerDisconnect(): void;

    sendMessage(message: string): void;
    addMediaStream(mediaStream: MediaStream): void;
    disconnect(): void;
}

abstract class BasePeerTasks implements PeerTasks {
    protected peerConnection?: RTCPeerConnection;
    protected dataChannel?: RTCDataChannel;
    private localMediaStream?: MediaStream;
    mediaStreamListener?: (mediaStream: MediaStreamTrack) => void;
    messageListener?: (message: string) => void;

    constructor(protected server: SignallingServer, private tokenGenerator: TokenGenerator) {
        this.server.connect(tokenGenerator);
        this.server.on('peerConnect', () => this.onPeerConnect());
        this.server.on('iceCandidate', candidate => this.onIceCandidate(candidate));
        this.server.on('offer', offer => this.onOffer(offer));
        this.server.on('answer', answer => this.onAnswer(answer));
        this.server.on('peerDisconnect', () => this.onPeerDisconnect());
        this.server.on('error', () => {
            // This indicates a disconnect from the server (not initiated by us).
            // We should try from the start again if we haven't got a peer connection yet.
        });
    }

    onPeerConnect(): void {
        if (this.peerConnection?.connectionState !== 'connected') {
            // If we're not connected and the peer is trying to connect again,
            // we probably failed the initial signalling.
            this.peerConnection?.close();
            this.peerConnection = undefined;
        }
        this.peerConnection = this.createPeerConnection();
        // Once we have reached peer connected state, we should disconnect from server.
        this.peerConnection.addEventListener('connectionstatechange', event => {
            const state = this.peerConnection?.connectionState;
            console.log(`Connection state: ${state}`);
            if (state === 'connected') {
                this.server.disconnect();
            }
        });
    }

    onIceCandidate(candidate: RTCIceCandidate): void {
        this.peerConnection?.addIceCandidate(candidate);
    }

    onOffer(offer: RTCSessionDescriptionInit): void {}

    onAnswer(answer: RTCSessionDescriptionInit): void {}

    onPeerDisconnect(): void {
        console.log('Peer disconnected.');
        // Don't do anything, as there may be a race condition between us and
        // the other peer reaching a "connected" RTC state, after which they
        // disconnect.
    }

    sendMessage(message: string): void {
        this.dataChannel?.send(message);
    }

    addMediaStream(mediaStream: MediaStream): void {
        this.localMediaStream = mediaStream;
    }

    disconnect(): void {
        this.server.disconnect();
        this.dataChannel?.close();
        this.peerConnection?.close();
        this.dataChannel = undefined;
        this.peerConnection = undefined;
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

        this.localMediaStream?.getTracks()?.forEach(track => {
            console.log('Adding local track');
            peerConnection.addTrack(track);
        });

        peerConnection.addEventListener('track', event => {
            console.log('Remote track event received');
            this.mediaStreamListener?.(event.track);
        });

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
        // For some reason, it appears that only the initiator can set this up.
        // Not entirely sure why yet.
        this.peerConnection?.addTransceiver('video');
        this.peerConnection?.createOffer().then(offer => {
            this.peerConnection?.setLocalDescription(offer);
            this.server.sendOffer(offer);
        });
    }

    onAnswer(answer: RTCSessionDescriptionInit): void {
        this.peerConnection?.setRemoteDescription(answer);
    }

    protected setupDataChannel(peerConnection: RTCPeerConnection) {
        this.dataChannel = peerConnection.createDataChannel('dataChannel');
        this.dataChannel.addEventListener('message', event => {
            this.messageListener?.(event.data);
        });
    }
}

class ResponderPeerTasks extends BasePeerTasks {
    onPeerConnect(): void {
        super.onPeerConnect();
    }

    onOffer(offer: RTCSessionDescriptionInit): void {
        this.peerConnection?.setRemoteDescription(offer);
        this.peerConnection?.createAnswer().then(answer => {
            this.peerConnection?.setLocalDescription(answer);
            this.server.sendAnswer(answer);
        });
    }

    protected setupDataChannel(peerConnection: RTCPeerConnection) {
        peerConnection.addEventListener('datachannel', event => {
            this.dataChannel = event.channel;
            this.dataChannel.addEventListener('message', event => {
                this.messageListener?.(event.data);
            });
        });
    }
}
