import { SignallingServer } from "./signalling-server";
import { TokenGenerator } from "./token-generator";

/** Wraps the entire process of setting up a P2P connection. */
export class ThingPeer {
    private server: SignallingServer;
    private peerTasks?: PeerTasks;
    private mediaStreamListener?: (mediaStream: MediaStreamTrack) => void;
    private messageListener?: (message: string) => void;

    constructor(serverUrl: string) {
        this.server = new SignallingServer({serverUrl});
    }

    connect(role: 'initiator' | 'responder', responderId: string, tokenGenerator: TokenGenerator, mediaStreams: MediaStream[]) {
        this.server.connect(tokenGenerator);
        this.peerTasks = role === 'initiator' ? new InitiatorPeerTasks(this.server) : new ResponderPeerTasks(this.server);
        this.peerTasks.mediaStreamListener = this.mediaStreamListener;
        this.peerTasks.messageListener = this.messageListener;
        mediaStreams.forEach(stream => {
            this.peerTasks!.addMediaStream(stream);
        });

        this.server.on('peerConnect', () => {
            this.peerTasks!.onPeerConnect();
        });

        this.server.on('iceCandidate', iceCandidate => {
            this.peerTasks!.onIceCandidate(iceCandidate);
        });

        this.server.on('offer', offer => {
            this.peerTasks!.onOffer(offer);
        });

        this.server.on('answer', answer => {
            this.peerTasks!.onAnswer(answer);
        });

        this.server.on('peerDisconnect', () => {
            // If we have not reached "connected" state with peer, tear down PeerConnection and all associated listeners etc.
            // Otherwise, ignore event.
            this.peerTasks!.onPeerDisconnect();
        });

        this.server.on('error', () => {
            // This indicates a disconnect from the server (not initiated by us).
            // We should try from the start again if we haven't got a peer connection yet.
        });
    }

    sendMessage(message: string): void {
        this.peerTasks?.sendMessage(message);
    }

    disconnect() {
        this.server.disconnect();
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

    constructor(protected server: SignallingServer) {}

    onPeerConnect(): void {
        this.peerConnection = this.createPeerConnection();
        // Once we have reached peer connected state, we should disconnect from server.
        this.peerConnection.addEventListener('connectionstatechange', event => {
            if (this.peerConnection!.connectionState === 'connected') {
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
        if (this.peerConnection?.connectionState !== 'connected') {
            this.peerConnection?.close();
            this.peerConnection = undefined;
        }
    }

    sendMessage(message: string): void {
        this.dataChannel?.send(message);
    }

    addMediaStream(mediaStream: MediaStream): void {
        this.localMediaStream = mediaStream;
    }

    disconnect(): void {
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
