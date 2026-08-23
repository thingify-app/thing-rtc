export { SignallingServer } from './signalling-server';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.split('/signalling/');
    console.log(`Request for URL: ${url}`);

    if (path.length === 2) {
      const pairingId = path[1];

      // Expect to receive a WebSocket Upgrade request.
      // If there is one, accept the request and return a WebSocket Response.
      const upgradeHeader = request.headers.get('Upgrade');
      if (!upgradeHeader || upgradeHeader !== 'websocket') {
        return new Response('Expected Upgrade: websocket', {
          status: 426,
        });
      }

      if (request.method !== 'GET') {
        return new Response('Worker expected GET method', {
          status: 400,
        });
      }

      // Instantiate/connect to a Durable Object with the name of the pairingId.
      // This single object will handle all messaging between peers of this
      // pairingId.
      const stub = env.SIGNALLING_SERVER.getByName(pairingId);

      return stub.fetch(request);
    } else {
      return new Response('not found', { status: 404 });
	  }
  }
} satisfies ExportedHandler<Env>;
