# ThingRTC Cloudflare Workers deployment

This is a Cloudflare Workers wrapper for running ThingRTC services on the edge.

Advantages of Cloudflare Workers include:
- Quick startup.
- Generous free tier.
- Globally-distributed edge locations for fast response.
- Effectively unlimited and simple scaling, as we use hibernatable Durable
  Objects to relay messages between peers.
- Idle WebSocket connections can stay connected without incurring costs, and
  will only wake up the Durable Object when messages are exchanged.
