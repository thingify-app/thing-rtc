import { SignallingServer } from "./signalling-server";
import { TokenGenerator } from "./token-generator";

/** Wraps the entire process of setting up a P2P connection. */
export class ThingPeer {
    private peerTasks?: PeerTasks;
    private connectionStateListener?: (state: ConnectionState) => void;
    private mediaStreamListener?: (mediaStream: MediaStreamTrack) => void;
    private stringMessageListener?: (message: string) => void;
    private binaryMessageListener?: (message: ArrayBuffer) => void;

    constructor(private serverUrl: string) {}

    connect(role: 'initiator' | 'responder', responderId: string, tokenGenerator: TokenGenerator, mediaStreams: MediaStream[]) {
        const server = new SignallingServer({serverUrl: this.serverUrl, tokenGenerator});
        this.peerTasks = role === 'initiator' ? new InitiatorPeerTasks(server) : new ResponderPeerTasks(server);
        this.peerTasks.connectionStateListener = this.connectionStateListener;
        this.peerTasks.mediaStreamListener = this.mediaStreamListener;
        this.peerTasks.stringMessageListener = this.stringMessageListener;
        this.peerTasks.binaryMessageListener = this.binaryMessageListener;
        mediaStreams.forEach(stream => {
            this.peerTasks!.addMediaStream(stream);
        });
    }

    sendMessage(message: string|ArrayBuffer): void {
        this.peerTasks?.sendMessage(message);
    }

    disconnect() {
        this.peerTasks?.disconnect();
    }

    on(type: 'connectionStateChanged', callback: (state: ConnectionState) => void): void;
    on(type: 'mediaStream', callback: (mediaStream: MediaStreamTrack) => void): void;
    on(type: 'stringMessage', callback: (message: string) => void): void;
    on(type: 'binaryMessage', callback: (message: Uint8Array) => void): void;
    on(type: string, callback: any): void {
        switch (type) {
            case 'connectionStateChanged':
                this.connectionStateListener = callback;
                if (this.peerTasks) {
                    this.peerTasks.connectionStateListener = callback;
                }
                break;
            case 'mediaStream':
                this.mediaStreamListener = callback;
                if (this.peerTasks) {
                    this.peerTasks.mediaStreamListener = callback;
                }
                break;
            case 'stringMessage':
                this.stringMessageListener = callback;
                if (this.peerTasks) {
                    this.peerTasks.stringMessageListener = callback;
                }
                break;
            case 'binaryMessage':
                this.binaryMessageListener = callback;
                if (this.peerTasks) {
                    this.peerTasks.binaryMessageListener = callback;
                }
                break;
            default:
                throw new Error(`Unknown event type: ${type}`);
        }
    }
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected';

interface PeerTasks {
    connectionStateListener?: (state: ConnectionState) => void;
    mediaStreamListener?: (mediaStream: MediaStreamTrack) => void;
    stringMessageListener?: (message: string) => void;
    binaryMessageListener?: (message: ArrayBuffer) => void;

    onPeerConnect(): void;
    onIceCandidate(candidate: RTCIceCandidate): void;
    onOffer(offer: RTCSessionDescriptionInit): void;
    onAnswer(answer: RTCSessionDescriptionInit): void;
    onPeerDisconnect(): void;

    sendMessage(message: string|ArrayBuffer): void;
    addMediaStream(mediaStream: MediaStream): void;
    disconnect(): void;
}

abstract class BasePeerTasks implements PeerTasks {
    protected peerConnection?: RTCPeerConnection;
    protected dataChannel?: RTCDataChannel;
    private localMediaStream?: MediaStream;
    connectionStateListener?: (state: ConnectionState) => void;
    mediaStreamListener?: (mediaStream: MediaStreamTrack) => void;
    stringMessageListener?: (message: string) => void;
    binaryMessageListener?: (message: ArrayBuffer) => void;

    constructor(protected server: SignallingServer) {
        this.server.connect();
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
        this.connectionStateListener?.('connecting');
        if (this.peerConnection?.connectionState !== 'connected') {
            // If we're not connected and the peer is trying to connect again,
            // we probably failed the initial signalling.
            this.peerConnection?.close();
            this.peerConnection = undefined;
        }
        this.peerConnection = this.createPeerConnection();
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

    sendMessage(message: string | ArrayBuffer): void;
    sendMessage(message: any): void {
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
        this.connectionStateListener?.('disconnected');
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

        peerConnection.addEventListener('connectionstatechange', event => {
            const state = this.peerConnection?.connectionState;
            console.log(`Connection state: ${state}`);
            // Once we have reached peer connected state, we should disconnect from server.
            if (state === 'connected') {
                this.connectionStateListener?.('connected');
                this.server.disconnect();
            } else if (state === 'disconnected' || state === 'failed') {
                // Disconnect from everything (server and RTC), reconnect to the signalling
                // server, and start again.
                this.disconnect();
                this.server.connect();
            }
        });

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

    protected onDataChannelMessage(message: any) {
        if (typeof message === 'string') {
            this.stringMessageListener?.(message);
        } else if (message instanceof ArrayBuffer) {
            this.binaryMessageListener?.(message);
        } else {
            console.error('Unknown message type received.');
        }
    }
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
        this.dataChannel = peerConnection.createDataChannel('dataChannel', {ordered: true, maxRetransmits: 0});
        this.dataChannel.addEventListener('message', event => {
            this.onDataChannelMessage(event.data);
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
                this.onDataChannelMessage(event.data);
            });
        });
    }
}
