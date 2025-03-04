#!/bin/bash

# Script to copy in required local dependencies and modify them to meet Deno's 
# requirements.
#
# Deno requires its own style of paths on import/export statements (either paths
# to local files or URLs to remote files). This conflicts with the "NPM style"
# of local paths without file extensions and remote NPM package names.
#
# To work around this, we bundle the signalling-server and its dependencies into
# a single JS file (this solves the remote NPM package name problem) and rewrite
# TypeScript type declarations with explicit paths.

set -e

function build_directory {
    name=$1

    npm --prefix "../../${name}" run build

    mkdir -p "dist/${name}"
    cp ../../${name}/dist/* "dist/${name}"

    # Replace bare import/exports of type declarations with their explicit filename
    # paths (e.g. `import { foo } from './bar';` replaces './bar' with './bar.d.ts')
    sed -i -E "s/((import|export) \{.*\} from )('|\")(.*)('|\");/\1\3\4.d.ts\5;/g" dist/${name}/*.d.ts
}

rm -rf dist

build_directory "signalling-server"
build_directory "pairing-server"
