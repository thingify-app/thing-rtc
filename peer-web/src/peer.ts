import { PeerConfig, Role } from "./peer-config/peer-config";
import { ServerAuth } from "./server-auth";
import { SignallingServer } from "./signalling-server";

const DEFAULT_DATA_CHANNEL_NAME = 'default';

export interface Listeners {
    connectionStateListener?: (state: ConnectionState) => void;
    mediaStreamListener?: (mediaStream: MediaStreamTrack) => void;
    dataChannelListener?: (dataChannel: DataChannel) => void;
    errorListener?: (error: string) => void;
}

/** Wraps the entire process of setting up a P2P connection. */
export class ThingPeer {
    private peerTasks?: PeerTasks;
    private connected = false;

    constructor(
        private serverUrl: string,
        private serverAuth: ServerAuth,
        private peerConfig: PeerConfig,
        private listeners: Listeners,
        private autoReconnect: boolean = true,
    ) {}

    connect(mediaStreams: MediaStream[]) {
        if (!this.connected) {
            this.connected = true;

            // Run asynchronously out of this function call.
            setTimeout(async () => {
                do {
                    console.log('Attempting connect...');
                    const server = new SignallingServer(
                        this.serverUrl,
                        this.serverAuth,
                        this.peerConfig.peerAuth,
                        this.peerConfig.pairingId
                    );
                    this.peerTasks = new PeerTasks(this.peerConfig.role, server, mediaStreams, this.listeners);

                    await this.peerTasks.connect();
                    this.peerTasks.close();

                    await waitMillis(1000);
                } while (this.connected && this.autoReconnect);
            }, 1);
        }
    }

    async createDataChannel(label: string, reliable: boolean): Promise<DataChannel> {
        if (this.peerTasks) {
            return await this.peerTasks?.createDataChannel(label, reliable);
        } else {
            throw new Error('Cannot create data channel - no active peer task');
        }
    }

    getDataChannel(label: string): DataChannel|null {
        return this.peerTasks?.getDataChannel(label) ?? null;
    }

    getDataChannels(): DataChannel[] {
        return this.peerTasks?.getDataChannels() ?? [];
    }

    disconnect() {
        this.peerTasks?.close();
        this.connected = false;
    }
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected';

/**
 * A task to attempt to connect to a peer once, and wait until the connection fails for any reason.
 */
class PeerTasks {
    private peerConnection: RTCPeerConnection;
    private dataChannels: DataChannel[] = [];
    private completionResolver = () => {};

    constructor(
        private role: Role,
        private server: SignallingServer,
        private localMediaStreams: MediaStream[],
        private listeners: Listeners,
    ) {
        this.peerConnection = this.createPeerConnection();
    }

    connect(): Promise<void> {
        const {promise, resolve, reject} = Promise.withResolvers<void>();
        this.completionResolver = resolve;

        this.listeners.connectionStateListener?.('connecting');
        this.setupListeners();
        this.server.connect();

        return promise;
    }

    private setupListeners() {
        this.setupCommon();

        switch (this.role) {
            case 'initiator':
                this.setupInitiator();
                break;
            case 'responder':
                this.setupResponder();
                break;
        }
    }

    private setupCommon() {
        this.localMediaStreams.forEach(mediaStream =>
            mediaStream.getTracks().forEach(track => {
                console.log('Adding local track');
                this.peerConnection.addTrack(track);
            })
        );

        this.peerConnection.addEventListener('connectionstatechange', event => {
            const state = this.peerConnection.connectionState;
            console.log(`Connection state: ${state}`);

            // Once we have reached peer connected state, we should disconnect from server.
            if (state === 'connected') {
                this.listeners.connectionStateListener?.('connected');
                this.server.disconnect();
            } else if (state === 'disconnected' || state === 'failed') {
                // Disconnect from everything (server and RTC).
                this.close();
            }
        });

        this.peerConnection.addEventListener('track', event => {
            console.log('Remote track event received');
            this.listeners.mediaStreamListener?.(event.track);
        });

        this.peerConnection.addEventListener('icecandidate', event => {
            if (event.candidate) {
                console.log(`Got candidate: ${event.candidate}`);
                this.server.sendIceCandidate(event.candidate);
            }
        });

        this.peerConnection.addEventListener('datachannel', event => {
            // Do not expose the default data channel to users.
            if (event.channel.label !== DEFAULT_DATA_CHANNEL_NAME) {
                const dataChannel = new DataChannel(event.channel);
                this.dataChannels.push(dataChannel);
                this.listeners.dataChannelListener?.(dataChannel);
            }
        });

        this.server.on('iceCandidate', candidate => {
            this.peerConnection.addIceCandidate(candidate);
        });

        this.server.on('peerDisconnect', () => {
            // Don't do anything, as there may be a race condition between us and
            // the other peer reaching a "connected" RTC state, after which they
            // disconnect.
            console.log('Peer disconnected.');
        });

        this.server.on('error', () => {
            // This indicates a disconnect from the server (not initiated by us).
            this.listeners.errorListener?.('Server error');
            this.close();
        });

        this.server.on('close', () => {
            // Only shut down this task if the server close was not intentional.
            if (this.peerConnection.connectionState !== 'connected') {
                this.close();
            }
        });
    }

    private setupInitiator() {
        // For some reason, it appears that only the initiator can set this up.
        // Not entirely sure why yet.
        this.peerConnection.addTransceiver('video');

        this.server.on('peerConnect', async () => {
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);
            this.server.sendOffer(offer);
        });

        this.server.on('answer', answer => {
            this.peerConnection.setRemoteDescription(answer);
        });

        // Create a default data channel - it appears that if we have this, we
        // can dynamically create new data channels later without renegotiating.
        this.peerConnection.createDataChannel(DEFAULT_DATA_CHANNEL_NAME);
    }

    private setupResponder() {
        this.server.on('offer', async offer => {
            this.peerConnection.setRemoteDescription(offer);
            const answer = await this.peerConnection.createAnswer();
            this.peerConnection.setLocalDescription(answer);
            this.server.sendAnswer(answer);
        });
    }

    async createDataChannel(label: string, reliable: boolean): Promise<DataChannel> {
        let channelConfig: RTCDataChannelInit;
        if (reliable) {
            channelConfig = {ordered: true};
        } else {
            channelConfig = {ordered: false, maxRetransmits: 0};
        }

        const dataChannel = this.peerConnection.createDataChannel(label, channelConfig);
        const wrapped = new DataChannel(dataChannel);
        const {promise, resolve} = Promise.withResolvers<DataChannel>();

        // TODO: reject the promise if the channel doesn't open within some timeout.
        dataChannel.addEventListener('open', () => {
            this.dataChannels.push(wrapped);
            this.listeners.dataChannelListener?.(wrapped);
            resolve(wrapped);
        });

        return promise;
    }

    getDataChannel(label: string): DataChannel|null {
        return this.dataChannels.find(dc => dc.getLabel() === label) ?? null;
    }

    getDataChannels(): DataChannel[] {
        return this.dataChannels;
    }

    close(): void {
        this.server.disconnect();
        this.peerConnection.close();
        this.dataChannels.forEach(dc => dc.close());
        this.dataChannels = [];
        this.listeners.connectionStateListener?.('disconnected');
        // Signal to those awaiting connect that we are closed.
        this.completionResolver();
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

        return new RTCPeerConnection(config);
    }
}

export class DataChannel {
    private stringMessageListener?: (message: string) => void;
    private binaryMessageListener?: (message: ArrayBuffer) => void;
    private closeListener?: () => void;

    constructor(private rtcDataChannel: RTCDataChannel) {
        rtcDataChannel.addEventListener('message', event => {
            const message = event.data;
            if (typeof message === 'string') {
                this.stringMessageListener?.(message);
            } else if (message instanceof ArrayBuffer) {
                this.binaryMessageListener?.(message);
            } else {
                console.error('Unknown message type received.');
            }
        });

        rtcDataChannel.addEventListener('close', () => {
            this.closeListener?.();
        });
    }

    async sendMessage(message: string|ArrayBuffer): Promise<void> {
        // Block the promise until the message can be buffered.
        while ((this.rtcDataChannel.bufferedAmount || 0) > 500_000) {
            await waitMillis(1);
        }
        this.rtcDataChannel.send(message as any);
    }

    getLabel(): string {
        return this.rtcDataChannel.label;
    }

    on(listenerType: 'binaryMessage', listener: (message: ArrayBuffer) => void): void;
    on(listenerType: 'stringMessage', listener: (message: string) => void): void;
    on(listenerType: 'close', listener: () => void): void;
    on(listenerType: 'stringMessage'|'binaryMessage'|'close', listener: (message?: any) => void): void {
        switch(listenerType) {
            case 'stringMessage':
                this.stringMessageListener = listener;
                break;
            case 'binaryMessage':
                this.binaryMessageListener = listener;
                break;
            case "close":
                this.closeListener = listener;
                break;
        }
    }

    close() {
        this.rtcDataChannel.close();
    }
}

async function waitMillis(millis: number): Promise<void> {
    return new Promise<void>((resolve, _) => {
        setTimeout(resolve, millis);
    });
}
