import { PeerAuth } from './peer-auth';

export type Role = 'initiator' | 'responder';

export interface PeerConfig {
    peerAuth: PeerAuth;
    pairingId: string;
    role: Role;
}
