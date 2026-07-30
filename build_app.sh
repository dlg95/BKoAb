#!/bin/bash
# Build a self-contained "BKoAb.app" — Python + FastAPI + React UI.
# Shareable result: notarized DMG at dist/BKoAb.dmg
#
#   ./build_app.sh
#
# Signing + notarization (same identity/profile as Subtitle Engine):
#   BKOAB_SIGN_ID="Developer ID Application: Red Azul LLC (DW5AV97JZH)" \
#   BKOAB_NOTARY_PROFILE="subu-notary" \
#   ./build_app.sh
#
# Defaults to that identity/profile when unset, if the Keychain identity exists.
set -euo pipefail
cd "$(dirname "$0")"

PY=.venv/bin/python
[ -x "$PY" ] || { echo "Bitte zuerst .venv anlegen und Abhängigkeiten installieren."; exit 1; }

DEFAULT_SIGN_ID="Developer ID Application: Red Azul LLC (DW5AV97JZH)"
DEFAULT_NOTARY_PROFILE="subu-notary"
BKOAB_SIGN_ID="${BKOAB_SIGN_ID:-$DEFAULT_SIGN_ID}"
BKOAB_NOTARY_PROFILE="${BKOAB_NOTARY_PROFILE:-$DEFAULT_NOTARY_PROFILE}"

# Skip signing if the identity is not in the keychain
if ! security find-identity -v -p codesigning 2>/dev/null | grep -Fq "$BKOAB_SIGN_ID"; then
  echo "Hinweis: Signatur-Identity nicht gefunden — baue unsigned."
  BKOAB_SIGN_ID=""
  BKOAB_NOTARY_PROFILE=""
fi

echo "Installiere Build-Abhängigkeiten …"
.venv/bin/pip install -q -e ".[dev]" pyinstaller >/dev/null

echo "Baue Frontend …"
(
  cd frontend
  if [ -f pnpm-lock.yaml ]; then
    corepack enable >/dev/null 2>&1 || true
    pnpm install --frozen-lockfile
    pnpm build
  else
    npm ci && npm run build
  fi
)

rm -rf build dist "BKoAb.spec"

# PyInstaller --add-data separator is ':' on macOS
FRONTEND_DIST="frontend/dist"
[ -d "$FRONTEND_DIST" ] || { echo "frontend/dist fehlt nach dem Build"; exit 1; }

echo "PyInstaller …"
.venv/bin/pyinstaller --noconfirm --windowed \
  --name "BKoAb" \
  --osx-bundle-identifier com.redazul.bkoab \
  --add-data "frontend/dist:frontend/dist" \
  --collect-all uvicorn \
  --collect-all fastapi \
  --collect-all starlette \
  --collect-all pydantic \
  --collect-all pydantic_core \
  --collect-all sqlalchemy \
  --collect-all greenlet \
  --collect-submodules bkoab \
  --hidden-import multipart \
  --hidden-import h11 \
  --hidden-import anyio \
  --hidden-import sniffio \
  --hidden-import httptools \
  --hidden-import uvloop \
  --hidden-import watchfiles \
  --hidden-import websockets \
  --hidden-import docx \
  --hidden-import lxml \
  --hidden-import pypdf \
  app_main.py

rm -f "BKoAb.spec"

APP="dist/BKoAb.app"
[ -d "$APP" ] || { echo "App-Bundle fehlt: $APP"; exit 1; }

# Ensure Info.plist has a sensible version
/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString 0.1.0" "$APP/Contents/Info.plist" 2>/dev/null \
  || /usr/libexec/PlistBuddy -c "Add :CFBundleShortVersionString string 0.1.0" "$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleName BKoAb" "$APP/Contents/Info.plist" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName BKoAb" "$APP/Contents/Info.plist" 2>/dev/null \
  || /usr/libexec/PlistBuddy -c "Add :CFBundleDisplayName string BKoAb" "$APP/Contents/Info.plist"

# ── Sign + notarize the app ─────────────────────────────────────────────────
if [ -n "${BKOAB_SIGN_ID}" ]; then
  echo "Signiere App: $BKOAB_SIGN_ID"
  codesign --deep --force --options runtime --timestamp --sign "$BKOAB_SIGN_ID" "$APP"
  codesign --verify --strict "$APP" || { echo "codesign-Verify fehlgeschlagen"; exit 1; }
  if [ -n "${BKOAB_NOTARY_PROFILE}" ]; then
    echo "Notarisiere App (Profil: $BKOAB_NOTARY_PROFILE) …"
    ditto -c -k --keepParent "$APP" "dist/_notarize.zip"
    xcrun notarytool submit "dist/_notarize.zip" --keychain-profile "$BKOAB_NOTARY_PROFILE" --wait
    xcrun stapler staple "$APP"
    rm -f "dist/_notarize.zip"
    echo "App notarisiert + gestapelt ✓"
  fi
else
  echo "Hinweis: UNSIGNIERT gebaut."
fi

# ── DMG ─────────────────────────────────────────────────────────────────────
DMG="dist/BKoAb.dmg"
rm -f "$DMG"
STAGE="$(mktemp -d)"
cp -R "$APP" "$STAGE/"
cp ONBOARDING.txt "$STAGE/LIESMICH-zuerst.txt"
ln -s /Applications "$STAGE/Programme"
echo "Baue DMG …"
hdiutil create -volname "BKoAb" -srcfolder "$STAGE" -ov -format UDZO "$DMG" >/dev/null
rm -rf "$STAGE"

if [ -n "${BKOAB_SIGN_ID}" ]; then
  codesign --force --timestamp --sign "$BKOAB_SIGN_ID" "$DMG"
  if [ -n "${BKOAB_NOTARY_PROFILE}" ]; then
    echo "Notarisiere DMG …"
    xcrun notarytool submit "$DMG" --keychain-profile "$BKOAB_NOTARY_PROFILE" --wait
    xcrun stapler staple "$DMG"
    echo "DMG notarisiert + gestapelt ✓"
  fi
fi

echo
echo "Built:"
du -sh "$APP" 2>/dev/null || true
du -sh "$DMG" 2>/dev/null || true
echo
echo "Fertig: dist/BKoAb.dmg"
echo "Öffnen → App auf „Programme“ ziehen → Doppelklick."
