# ThingRTC Deno Deploy deployment

This is a Deno Deploy wrapper for running ThingRTC services on the edge.

Advantages of Deno Deploy include:
- Quick startup.
- Generous free tier.
- Globally-distributed edge locations for fast response.
- Effectively unlimited and simple scaling, as we use the `BroadcastChannel`
  API to send messages between peers.

## Initial setup
- Install Deno and the `deployctl` CLI tool.
- Run `./setup.sh` to build and import the required local dependencies.
- Generate a keypair and store the public JWK as `publicKey.json`.

## Run locally
- Run `./run.sh` to run locally with the required flags.
