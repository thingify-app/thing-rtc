import * as jwt from 'jsonwebtoken';

export interface AuthValidator {
    validateToken(token: string): ParsedToken;
}

export class ParseThroughAuthValidator implements AuthValidator {
    validateToken(token: string): ParsedToken {
        return JSON.parse(token);
    }
}

export class JwtAuthValidator implements AuthValidator {
    constructor(private publicKey: Buffer) {}

    validateToken(token: string): ParsedToken {
        const parsedToken = jwt.verify(token, this.publicKey, {}) as JwtToken;
        return {
            pairingId: parsedToken.pairingId,
            role: parsedToken.role,
            expiry: Number.MAX_SAFE_INTEGER
        };
    }
}

export type Role = 'initiator' | 'responder';

export interface ParsedToken {
    pairingId: string;
    role: Role;
    expiry: number;
}

interface JwtToken {
    pairingId: string;
    role: Role;
    iat: number;
}
