import axios from 'axios';

export class PairingServer {
    private http = axios.create({
        baseURL: this.serverUrl
    });

    constructor(private serverUrl: string) {}

    async createPairingRequest(responderPublicKey: string): Promise<ResponderPairDetails> {
        const body = {
            publicKey: responderPublicKey
        };
        return (await this.http.post<ResponderPairDetails>('/createPairing', body)).data;
    }

    async checkPairingStatus(pairingId: string): Promise<PairingStatus> {
        return (await this.http.post<PairingStatus>(`/pairingStatus/${pairingId}`)).data;
    }

    async respondToPairingRequest(shortcode: string, initiatorPublicKey: string): Promise<InitiatorPairDetails> {
        const body = {
            publicKey: initiatorPublicKey
        };
        return (await this.http.post<InitiatorPairDetails>(`/respondToPairing/${shortcode}`, body)).data;
    }
}

export interface ResponderPairDetails {
    pairingId: string;
    shortcode: string;
    responderToken: string;
    expiry: number;
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
