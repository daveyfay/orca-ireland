#!/usr/bin/env bash
# ORCA Ireland — Decoder Bridge (macOS installer)
# Double-click this file to set up the bridge on a Mac.
# The .command extension makes it double-clickable in Finder.

set -e
cd "$(dirname "$0")"

echo ""
echo "======================================================"
echo "  ORCA Ireland — Decoder Bridge Installer (macOS)"
echo "======================================================"
echo ""

TARGET="$HOME/orca-bridge"

# ---- 1. Check for Node.js ----
if ! command -v node >/dev/null 2>&1; then
  echo "[!] Node.js is not installed."
  echo ""
  echo "    Install it first. Easiest options:"
  echo "      • Download the LTS installer from https://nodejs.org"
  echo "      • Or with Homebrew:  brew install node"
  echo ""
  echo "    Then double-click this file again."
  echo ""
  open "https://nodejs.org" || true
  read -n1 -r -p "Press any key to exit..." _
  exit 1
fi

echo "[OK] Node.js $(node -v) detected."
echo ""

# ---- 2. Download the bridge code ----
echo "Installing into: $TARGET"
mkdir -p "$TARGET"
cd "$TARGET"

echo "Downloading bridge code..."
ZIP="$TARGET/orca-bridge.zip"
REPO="https://github.com/daveyfay/orca-ireland/archive/refs/heads/master.zip"

if ! curl -L -f -s -o "$ZIP" "$REPO"; then
  echo "[!] Download failed. Check your internet connection."
  read -n1 -r -p "Press any key to exit..." _
  exit 1
fi

echo "Extracting..."
rm -rf "$TARGET/_tmp"
mkdir -p "$TARGET/_tmp"
unzip -q "$ZIP" -d "$TARGET/_tmp"

# Copy only the bridge folder contents into $TARGET.
cp -R "$TARGET/_tmp/orca-ireland-master/bridge/". "$TARGET/"
rm -rf "$TARGET/_tmp" "$ZIP"

echo "[OK] Bridge code installed."
echo ""

# ---- 3. npm install ----
echo "Installing dependencies (this may take a minute)..."
cd "$TARGET"
npm install --omit=dev --loglevel=error
echo "[OK] Dependencies installed."
echo ""

# ---- 4. Default config in simulator mode ----
if [ ! -f "$TARGET/config.json" ]; then
  cat > "$TARGET/config.json" <<'JSON'
{
  "decoder": "amb",
  "simulate": true,
  "wsPort": 2346
}
JSON
  echo "[OK] Created config.json in simulator mode."
  echo "     Edit $TARGET/config.json when you have decoder details."
else
  echo "[OK] Keeping existing config.json."
fi
echo ""

# ---- 5. Desktop launcher ----
LAUNCHER="$HOME/Desktop/run-orca-bridge.command"
cat > "$LAUNCHER" <<EOF
#!/usr/bin/env bash
cd "$TARGET"
echo "ORCA Decoder Bridge — press Ctrl-C to stop."
node bridge.js
EOF
chmod +x "$LAUNCHER"
echo "[OK] Shortcut created on Desktop: run-orca-bridge.command"
echo ""

echo "======================================================"
echo "  Installation complete."
echo ""
echo "  To start the bridge:"
echo "    Double-click 'run-orca-bridge.command' on your Desktop."
echo ""
echo "  To switch from simulator to a real decoder, edit:"
echo "    $TARGET/config.json"
echo ""
echo "  Race control connects to ws://localhost:2346 (this Mac)"
echo "  or ws://<this-mac-ip>:2346 from other devices on WiFi."
echo "======================================================"
echo ""
read -n1 -r -p "Press any key to close..." _
