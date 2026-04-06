#!/bin/bash
# Railhead launcher — runs the pre-built Electron app
cd "$(dirname "$0")"
node_modules/.bin/electron out/main/index.js "$@" 2>&1 | tee /tmp/railhead-run.log
