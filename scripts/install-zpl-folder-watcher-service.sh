#!/bin/bash
# Installeer de ZPL folder watcher als launchd-service (start bij inloggen, herstart bij crash).
# Bewaakt ~/Downloads op ZPL-bestanden en print ze automatisch naar de Zebra.
#
# Uitvoeren vanaf de projectroot: ./scripts/install-zpl-folder-watcher-service.sh
# Optioneel andere map:          WATCH_DIR=~/Desktop ./scripts/install-zpl-folder-watcher-service.sh

set -e
cd "$(dirname "$0")/.."
PROJECT_PATH="$PWD"
NODE_PATH="$(command -v node || true)"
[ -z "$NODE_PATH" ] && NODE_PATH="/opt/homebrew/bin/node"

WATCH_DIR_VAL="${WATCH_DIR:-$HOME/Downloads}"
# Expand tilde
WATCH_DIR_VAL="${WATCH_DIR_VAL/#\~/$HOME}"

mkdir -p "$PROJECT_PATH/logs"
PLIST_DEST="$HOME/Library/LaunchAgents/com.winkel.zpl-folder-watcher.plist"

sed -e "s|PROJECT_PATH|$PROJECT_PATH|g" \
    -e "s|/opt/homebrew/bin/node|$NODE_PATH|g" \
    -e "s|WATCH_DIR_VALUE|$WATCH_DIR_VAL|g" \
    scripts/com.winkel.zpl-folder-watcher.plist > "$PLIST_DEST"
echo "Plist geïnstalleerd: $PLIST_DEST"
echo "Bewaakt map: $WATCH_DIR_VAL"

# Stop oude versie als die draait
launchctl unload "$PLIST_DEST" 2>/dev/null || true
# Start de service
launchctl load "$PLIST_DEST"
echo "Folder watcher gestart. Log: $PROJECT_PATH/logs/zpl-folder-watcher.log"
echo ""
echo "Handige commando's:"
echo "  Status:    launchctl list | grep com.winkel.zpl-folder"
echo "  Log:       tail -f $PROJECT_PATH/logs/zpl-folder-watcher.log"
echo "  Stoppen:   launchctl unload ~/Library/LaunchAgents/com.winkel.zpl-folder-watcher.plist"
echo "  Herstart:  launchctl unload ~/Library/LaunchAgents/com.winkel.zpl-folder-watcher.plist && launchctl load ~/Library/LaunchAgents/com.winkel.zpl-folder-watcher.plist"
