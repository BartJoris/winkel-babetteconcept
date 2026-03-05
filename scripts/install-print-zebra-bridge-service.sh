#!/bin/bash
# Installeer de Zebra print-bridge als launchd-service (start bij inloggen, herstart bij crash).
# Uitvoeren vanaf de projectroot: ./scripts/install-print-zebra-bridge-service.sh

set -e
cd "$(dirname "$0")/.."
PROJECT_PATH="$PWD"
NODE_PATH="$(command -v node || true)"
[ -z "$NODE_PATH" ] && NODE_PATH="/opt/homebrew/bin/node"

mkdir -p "$PROJECT_PATH/logs"
PLIST_DEST="$HOME/Library/LaunchAgents/com.winkel.print-zebra-bridge.plist"
sed -e "s|PROJECT_PATH|$PROJECT_PATH|g" \
    -e "s|/opt/homebrew/bin/node|$NODE_PATH|g" \
    scripts/com.winkel.print-zebra-bridge.plist > "$PLIST_DEST"
echo "Plist geïnstalleerd: $PLIST_DEST"

# Stop oude versie als die draait
launchctl unload "$PLIST_DEST" 2>/dev/null || true
# Start de service
launchctl load "$PLIST_DEST"
echo "Bridge-service gestart. Log: $PROJECT_PATH/logs/print-zebra-bridge.log"
echo ""
echo "Handige commando's:"
echo "  Status:    launchctl list | grep com.winkel.print-zebra"
echo "  Stoppen:   launchctl unload ~/Library/LaunchAgents/com.winkel.print-zebra-bridge.plist"
echo "  Herstart:  launchctl unload ... && launchctl load ..."
