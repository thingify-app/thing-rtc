import { TokenGenerator } from "../token-generator";
import { PairingData } from "./pairing-storage";
import { signMessage as sign, verifyMessage as verify } from './crypto';

export class PairingTokenGenerator implements TokenGenerator {

    constructor(private pairingData: PairingData) {}

    async generateToken(): Promise<string> {
        return this.pairingData.serverToken;
    }

    async signMessage(message: string): Promise<ArrayBuffer> {
        return await sign(this.pairingData.localKeyPair.privateKey, message);
    }

    async verifyMessage(signature: string, message: string): Promise<boolean> {
        return await verify(this.pairingData.remotePublicKey, signature, message);
    }
}
