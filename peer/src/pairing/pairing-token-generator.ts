import { Role, TokenGenerator } from "../token-generator";
import { PairingData } from "./pairing-storage";
import { signMessage as sign, verifyMessage as verify } from './crypto';
import { decode, encode } from "base64-arraybuffer";

export class PairingTokenGenerator implements TokenGenerator {

    constructor(private pairingData: PairingData) {}

    async generateToken(): Promise<string> {
        return this.pairingData.serverToken;
    }

    getRole(): Role {
        return this.pairingData.role;
    }

    async signMessage(message: string): Promise<string> {
        return encode(await sign(this.pairingData.localKeyPair.privateKey, message));
    }

    async verifyMessage(base64Signature: string, message: string): Promise<boolean> {
        const signature = decode(base64Signature);
        return await verify(this.pairingData.remotePublicKey, signature, message);
    }
}
