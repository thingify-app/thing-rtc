import { jwtVerify, KeyLike } from 'jose/jwt/verify';

export interface AuthValidator {
    validateToken(token: string): Promise<ParsedToken>;
}

export class ParseThroughAuthValidator implements AuthValidator {
    async validateToken(token: string): Promise<ParsedToken> {
        return JSON.parse(token);
    }
}

export class JwtAuthValidator implements AuthValidator {
    constructor(private publicKey: KeyLike) {}

    async validateToken(token: string): Promise<ParsedToken> {
        const result = await jwtVerify(token, this.publicKey, { algorithms: ['RS256'] });
        const parsedToken = result.payload as unknown as ParsedToken;
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
