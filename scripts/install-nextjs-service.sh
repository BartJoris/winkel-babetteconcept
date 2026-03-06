#!/bin/bash
# Installeer de Next.js app als launchd-service (start bij inloggen, herstart bij crash).
# Gebruik 'npm run build' na een update; daarna herlaad de service.
# Uitvoeren vanaf de projectroot: ./scripts/install-nextjs-service.sh

set -e
cd "$(dirname "$0")/.."
PROJECT_PATH="$PWD"
NODE_PATH="$(command -v node || true)"
[ -z "$NODE_PATH" ] && NODE_PATH="/opt/homebrew/bin/node"

mkdir -p "$PROJECT_PATH/logs"

# Eerst builden zodat 'next start' iets heeft om te draaien
if [ ! -d ".next" ]; then
  echo "Eerste keer: npm run build uitvoeren..."
  npm run build
fi

PLIST_DEST="$HOME/Library/LaunchAgents/com.winkel.nextjs.plist"
sed -e "s|PROJECT_PATH|$PROJECT_PATH|g" \
    -e "s|NODE_PATH|$NODE_PATH|g" \
    scripts/com.winkel.nextjs.plist > "$PLIST_DEST"
echo "Plist geïnstalleerd: $PLIST_DEST"

# Stop oude versie als die draait
launchctl unload "$PLIST_DEST" 2>/dev/null || true
# Start de service
launchctl load "$PLIST_DEST"
echo "Next.js-service gestart. App: http://localhost:3001"
echo "Log: $PROJECT_PATH/logs/nextjs.log"
echo ""
echo "Handige commando's:"
echo "  Status:    launchctl list | grep com.winkel.nextjs"
echo "  Stoppen:   launchctl unload ~/Library/LaunchAgents/com.winkel.nextjs.plist"
echo "  Herstart:  launchctl unload ... && launchctl load ..."
echo ""
echo "Na 'git pull' of codewijziging: npm run build && launchctl unload ... && launchctl load ..."
