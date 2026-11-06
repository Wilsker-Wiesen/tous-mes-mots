#!/bin/sh
# Pocket TTS (Kyutai, Open Source) nach private/tts/ laden und die Prüfsumme kontrollieren. Die Modelle lädt
# das Programm beim ersten Start selbst (Französisch und Deutsch je 672 MB).
set -eu
VERSION=v4.0.1
NAME=pocket-tts-3.3.0-x86_64-apple-darwin
URL="https://github.com/kyutai-labs/pocket-tts/releases/download/$VERSION"
mkdir -p private/tts
cd private/tts
curl -fsSL -o "$NAME.tar.gz" "$URL/$NAME.tar.gz"
curl -fsSL -o SHA256SUMS "$URL/SHA256SUMS"
grep "$NAME.tar.gz" SHA256SUMS | shasum -a 256 -c -
tar xzf "$NAME.tar.gz"
"./$NAME/pocket-tts" --help > /dev/null
echo "Installiert. Jetzt zur Probe: npm run audio -- --limit=20"
