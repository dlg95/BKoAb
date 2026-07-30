#!/usr/bin/env bash
# Download official LibreOffice macOS DMG and copy LibreOffice.app into a target
# directory (typically BKoAb.app/Contents/Resources).
#
# LibreOffice is licensed under MPL-2.0 — redistribution in app bundles is allowed.
# See THIRD_PARTY_NOTICES.md.
#
# Usage:
#   ./scripts/bundle_libreoffice_macos.sh /path/to/BKoAb.app/Contents/Resources
#
# Env:
#   BKOAB_LIBREOFFICE_VERSION  default: 26.2.5
#   BKOAB_SKIP_LIBREOFFICE_BUNDLE=1  skip (for quick local builds)
set -euo pipefail

if [[ "${BKOAB_SKIP_LIBREOFFICE_BUNDLE:-}" == "1" ]]; then
  echo "Hinweis: LibreOffice-Bundle übersprungen (BKOAB_SKIP_LIBREOFFICE_BUNDLE=1)."
  exit 0
fi

DEST_DIR="${1:-}"
if [[ -z "$DEST_DIR" ]]; then
  echo "Usage: $0 <Resources-Verzeichnis>"
  exit 1
fi
mkdir -p "$DEST_DIR"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CACHE_DIR="${ROOT}/vendor/libreoffice-macos"
VERSION="${BKOAB_LIBREOFFICE_VERSION:-26.2.5}"

ARCH="$(uname -m)"
if [[ "$ARCH" == "arm64" ]]; then
  ARCH_PATH="aarch64"
  FILE="LibreOffice_${VERSION}_MacOS_aarch64.dmg"
elif [[ "$ARCH" == "x86_64" ]]; then
  ARCH_PATH="x86_64"
  FILE="LibreOffice_${VERSION}_MacOS_x86-64.dmg"
else
  echo "Nicht unterstützte macOS-Architektur: $ARCH"
  exit 1
fi

URL="https://download.documentfoundation.org/libreoffice/stable/${VERSION}/mac/${ARCH_PATH}/${FILE}"
DMG="${CACHE_DIR}/${FILE}"
APP_DEST="${DEST_DIR}/LibreOffice.app"

if [[ -x "${APP_DEST}/Contents/MacOS/soffice" ]]; then
  echo "Gebündeltes LibreOffice bereits vorhanden: $APP_DEST"
  exit 0
fi

mkdir -p "$CACHE_DIR"
if [[ ! -f "$DMG" ]]; then
  echo "Lade LibreOffice ${VERSION} (${ARCH_PATH}) …"
  echo "  $URL"
  curl -fL --retry 3 --retry-delay 2 -o "${DMG}.partial" "$URL"
  mv "${DMG}.partial" "$DMG"
fi

MOUNT="$(mktemp -d /tmp/bkoab-lo-mount.XXXXXX)"
cleanup() {
  hdiutil detach "$MOUNT" >/dev/null 2>&1 || true
  rmdir "$MOUNT" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "Mount DMG …"
hdiutil attach "$DMG" -nobrowse -readonly -mountpoint "$MOUNT" >/dev/null

SRC_APP=""
for candidate in "$MOUNT"/LibreOffice.app "$MOUNT"/*/LibreOffice.app; do
  if [[ -d "$candidate" ]]; then
    SRC_APP="$candidate"
    break
  fi
done
if [[ -z "$SRC_APP" || ! -x "$SRC_APP/Contents/MacOS/soffice" ]]; then
  echo "LibreOffice.app nicht im DMG gefunden."
  exit 1
fi

echo "Kopiere LibreOffice.app nach $APP_DEST …"
rm -rf "$APP_DEST"
ditto "$SRC_APP" "$APP_DEST"

if [[ ! -x "${APP_DEST}/Contents/MacOS/soffice" ]]; then
  echo "Kopieren fehlgeschlagen — soffice fehlt."
  exit 1
fi

# Size hint for builders
du -sh "$APP_DEST" || true
echo "LibreOffice gebündelt ✓"
