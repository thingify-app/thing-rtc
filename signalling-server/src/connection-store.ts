export interface ConnectionStore {
    putConnection(connection: Connection): Promise<void>;
    getConnection(pairingId: string, role: Role): Promise<Connection>;
    hasConnection(pairingId: string, role: Role): Promise<boolean>;
    deleteConnection(pairingId: string, role: Role): Promise<void>;
}

export class InMemoryConnectionStore implements ConnectionStore {
    private connectionMap = new Map<string, Connection>();

    async putConnection(connection: Connection): Promise<void> {
        this.connectionMap.set(this.getKey(connection.pairingId, connection.role), connection);
    }

    async getConnection(pairingId: string, role: Role): Promise<Connection> {
        return this.connectionMap.get(this.getKey(pairingId, role));
    }

    async hasConnection(pairingId: string, role: Role): Promise<boolean> {
        return this.connectionMap.has(this.getKey(pairingId, role));
    }

    async deleteConnection(pairingId: string, role: Role): Promise<void> {
        this.connectionMap.delete(this.getKey(pairingId, role));
    }

    private getKey(pairingId: string, role: Role): string {
        return `${pairingId}/${role}`;
    }
}

export interface Connection {
    pairingId: string;
    nonce: string;
    role: Role;
    sendMessage(message: string): void;
    sendPeerConnect(nonce: string): void;
    sendPeerDisconnect(): void;
}

export type Role = 'initiator'|'responder';
