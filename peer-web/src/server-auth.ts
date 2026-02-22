import { Role } from "./peer-config/peer-config";

export interface ServerAuth {
    generateToken(): Promise<string>;
}

export class InsecureServerAuth implements ServerAuth {
    constructor(private pairingId: string, private role: Role) {}

    async generateToken(): Promise<string> {
        const tokenStructure = {
            pairingId: this.pairingId,
            role: this.role,
            expiry: Number.MAX_SAFE_INTEGER
        };
        return JSON.stringify(tokenStructure);
    }
}
