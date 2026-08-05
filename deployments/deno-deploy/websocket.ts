// Represents a general socket that must be implemented to communicate with the
// client, e.g. by adapting to a Websocket implementation.
export interface Socket {
  onMessage(listener: (message: string) => void): void;
  onClose(listener: () => void): void;

  sendMessage(message: string): Promise<void>;
  close(): Promise<void>;
}

export function websocketToSocket(ws: WebSocket): Socket {
  let messageListener = (_: string) => {};
  let closeListener = () => {};
  ws.addEventListener('message', event => messageListener(event.data));
  ws.addEventListener('close', _ => closeListener());

  return {
    onMessage: listener => { messageListener = listener },
    onClose: listener => { closeListener = listener },
    sendMessage: async data => await ws.send(data),
    close: async () => await ws.close(),
  };
}
