// Represents a general socket that must be implemented to communicate with the
// client, e.g. by adapting to a Websocket implementation.
export interface Socket {
    listenMessage(): Promise<string>;
    sendMessage(message: string): Promise<void>;
    close(): Promise<void>;
}
