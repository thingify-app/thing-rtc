import z from 'zod';

export interface AuthValidator {
  validateToken(token: string): Promise<ParsedToken>;
}

export class ParseThroughAuthValidator implements AuthValidator {
  async validateToken(token: string): Promise<ParsedToken> {
    return ParsedToken.parse(JSON.parse(token));
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
