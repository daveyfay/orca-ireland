#!/usr/bin/env bash
# ORCA Ireland — Raspberry Pi bridge installer.
# Run on a fresh Raspberry Pi OS (Bookworm or later) as the default `pi` user:
#   curl -L https://raw.githubusercontent.com/daveyfay/orca-ireland/main/bridge/install.sh | bash
# Or, from a clone:
#   cd orca-ireland/bridge && sudo bash install.sh

set -euo pipefail

echo "==> ORCA decoder bridge installer"

if [ "$(id -u)" != "0" ]; then
  echo "This script must be run with sudo." >&2
  exit 1
fi

# 1. Node.js (prefer 20 LTS via NodeSource; fall back to apt's node if present)
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -c2 | tr -d '\n')" -lt "1" ]; then
  echo "==> Installing Node.js 20 LTS"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
node -v

# 2. Copy files into /opt/orca-bridge
TARGET=/opt/orca-bridge
SRC="$(cd "$(dirname "$0")" && pwd)"
echo "==> Installing bridge into $TARGET"
mkdir -p "$TARGET"
cp -r "$SRC"/{bridge.js,parsers,package.json,config.example.json} "$TARGET"/
cd "$TARGET"

# 3. Install npm deps (ws always; serialport only if arch supported)
echo "==> Installing npm dependencies"
npm install --omit=dev --loglevel=error

# 4. Config file
if [ ! -f "$TARGET/config.json" ]; then
  cp "$TARGET/config.example.json" "$TARGET/config.json"
  echo "==> Created $TARGET/config.json — EDIT IT to point at your decoder."
fi

# 5. Systemd service
cp "$SRC/orca-bridge.service" /etc/systemd/system/orca-bridge.service
chown -R pi:pi "$TARGET"
systemctl daemon-reload
systemctl enable orca-bridge
systemctl restart orca-bridge

echo ""
echo "==> Done. Service is running on boot as 'orca-bridge'."
echo "    Edit config:     sudo nano $TARGET/config.json"
echo "    Restart:         sudo systemctl restart orca-bridge"
echo "    Watch logs:      journalctl -u orca-bridge -f"
echo "    Test endpoint:   curl http://localhost:2346/status"
echo ""
echo "==> Find the Pi's IP with 'hostname -I' — browser connects to ws://<that-ip>:2346"
