#!/usr/bin/env bash
# Vercel build entry — drives agent-native build with verbose debug
# so failures show CWD, env, and the resulting .vercel/output tree.

echo ">>> CWD:"
pwd
echo ">>> NITRO_PRESET:$NITRO_PRESET"
echo ">>> agent-native bin:"
ls -la node_modules/.bin/agent-native* 2>&1 | head -3
echo ">>> Running agent-native build..."
./node_modules/.bin/agent-native build
echo ">>> build exit:$?"
echo ">>> .vercel/output structure:"
find .vercel/output -maxdepth 3 2>&1 | head -50
