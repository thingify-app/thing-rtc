#!/bin/bash

set -e

# Trap signals so that we kill child processes before exiting.
trap "trap - SIGTERM && kill -- -$$" SIGINT SIGTERM EXIT

# Live-compile pairing-server library in background.
npm --prefix pairing-server run buildWatch &

# Live-compile signalling-server library in background.
npm --prefix signalling-server run buildWatch &

# Live-compile peer library in background.
npm --prefix peer run buildWatch &

# Live-compile static frontend in background.
npm --prefix deployments/static-example run buildWatch &

# Serve express example in background.
npm --prefix deployments/express run serve &

# Keep running until we kill the script and all child processes.
wait
