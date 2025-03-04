#!/bin/bash

set -e

# Trap signals so that we kill child processes before exiting.
trap "trap - SIGTERM && kill -- -$$" SIGINT SIGTERM EXIT

# Live-compile pairing-server library in background.
npm --prefix pairing-server run buildWatch &

# Live-compile signalling-server library in background.
npm --prefix signalling-server run buildWatch &

# Live-compile peer library in background.
npm --prefix web-peer run buildWatch &

# Serve Deno pairing/signalling example in background.
cd deployments/deno-deploy && ./run.sh &

# Serve static frontend in background.
npm --prefix deployments/static-example run serve &

# Keep running until we kill the script and all child processes.
wait
