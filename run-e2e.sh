#!/bin/bash

set -e

# Trap signals so that we kill child processes before exiting.
trap "trap - SIGTERM && kill -- -$$" SIGINT SIGTERM EXIT

# Live-compile server library in background.
npm --prefix server run buildWatch &

# Live-compile peer library in background.
npm --prefix peer run buildWatch &

# Serve example in background.
npm --prefix example run serve &

# Keep running until we kill the script and all child processes.
wait
