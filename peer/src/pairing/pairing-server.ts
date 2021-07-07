import axios, { AxiosInstance } from 'axios';
import { CompletablePromise } from './completable-promise';

export class PairingServer {
    private httpServerUrl: string;
    private wsServerUrl: string;
    private http: AxiosInstance;

    constructor(serverUrl: string) {
        this.httpServerUrl = serverUrl;
        this.wsServerUrl = serverUrl.replace('http', 'ws');
        this.http = axios.create({
            baseURL: this.httpServerUrl
        });
    }

    async createPairingRequest(responderPublicKey: string): Promise<ServerPendingPairing> {
        return new Promise((resolve, reject) => {
            const socket = new WebSocket(this.wsServerUrl);
            const pairingStatusPromise = new CompletablePromise<PairingStatus>();
            let pendingPairing: ServerPendingPairing;

            socket.addEventListener('open', async () => {
                socket.send(responderPublicKey);
            });

            socket.addEventListener('message', event => {
                if (!pendingPairing) {
                    const pairingData = JSON.parse(event.data) as InitialPairingData;
                    pendingPairing = {
                        pairingData,
                        redemptionResult: () => pairingStatusPromise.promise()
                    };
                    resolve(pendingPairing);
                } else {
                    const pairingStatus = JSON.parse(event.data) as PairingStatus;
                    pairingStatusPromise.complete(pairingStatus);
                    socket.close();
                }
            });

            socket.addEventListener('error', error => {
                console.log('Socket error.');
                reject(error);
            });

            socket.addEventListener('close', () => {
                console.log('Socket close.');
                reject('Socket closed');
                pairingStatusPromise.cancel('Socket closed');
            });
        });
    }

    async respondToPairingRequest(shortcode: string, initiatorPublicKey: string): Promise<InitiatorPairDetails> {
        const body = {
            publicKey: initiatorPublicKey
        };
        return (await this.http.post<InitiatorPairDetails>(`/respondToPairing/${shortcode}`, body)).data;
    }
}

export interface PairingStatus {
    status: 'awaiting' | 'paired';
    initiatorPublicKey?: string;
}

export interface InitiatorPairDetails {
    pairingId: string;
    responderPublicKey: string;
    initiatorToken: string;
}

export interface ServerPendingPairing {
    pairingData: InitialPairingData;
    redemptionResult(): Promise<PairingStatus>;
}

export interface InitialPairingData {
    pairingId: string;
    shortcode: string;
    token: string;
    expiry: number;
}
