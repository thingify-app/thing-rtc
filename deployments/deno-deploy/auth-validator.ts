import { jwtVerify, KeyLike } from 'jose';
import z from 'zod';

export interface AuthValidator {
  validateToken(token: string): Promise<ParsedToken>;
}

export class ParseThroughAuthValidator implements AuthValidator {
  async validateToken(token: string): Promise<ParsedToken> {
    return ParsedToken.parse(JSON.parse(token));
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

const Role = z.enum(['initiator', 'responder']);
export type Role = z.infer<typeof Role>;

const ParsedToken = z.object({
  pairingId: z.string(),
  role: Role,
  expiry: z.number(),
});

export type ParsedToken = z.infer<typeof ParsedToken>;
