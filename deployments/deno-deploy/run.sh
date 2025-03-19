PUBLIC_KEY=$(cat publicKey.json) PRIVATE_KEY=$(cat privateKey.json) deno run --allow-net --allow-env --unstable-broadcast-channel --watch main.ts
