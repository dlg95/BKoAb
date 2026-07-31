#!/usr/bin/env bash
# Download official LibreOffice macOS DMG and copy LibreOffice.app into a target
# directory (typically BKoAb.app/Contents/Resources).
#
# LibreOffice is licensed under MPL-2.0 — redistribution in app bundles is allowed.
# Official notices: https://www.libreoffice.org/licenses/
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

# ── Strip unused modules for headless DOCX→PDF only ─────────────────────────
# DOCX itself is produced by python-docx; LibreOffice is only needed as a PDF
# filter (writer_pdf_Export). Removing Calc/Impress UI assets, help, dicts,
# embedded Python, and most bundled fonts roughly halves the bundle.
# Keep presets/ — removing them can hang headless soffice on first run.
strip_libreoffice_for_pdf() {
  local app="$1"
  local R="$app/Contents/Resources"
  local F="$app/Contents/Frameworks"
  local M="$app/Contents/MacOS"
  local before after

  before="$(du -sk "$app" | awk '{print $1}')"

  rm -rf \
    "$R/help" \
    "$R/gallery" \
    "$R/wizards" \
    "$R/fingerprint" \
    "$R/readmes" \
    "$R/xpdfimport" \
    "$R/java" \
    "$R/firebird" \
    "$R/numbertext" \
    "$R/labels" \
    "$R/extensions" \
    "$R/template" \
    "$R/basic" \
    "$R/Scripts" \
    "$R/autotext" \
    "$R/palette" \
    "$R/__pycache__" \
    "$F/intl"

  # Drop dangling symlinks (e.g. firebird → Resources/firebird) — codesign --deep fails otherwise
  find "$app" -type l ! -exec test -e {} \; -delete

  rm -f \
    "$R/CREDITS.fodt" \
    "$R/LICENSE.html" \
    "$R/access2base.py" \
    "$R/scriptforge.pyi"

  # GUI icon themes (headless conversion does not need them)
  if [[ -d "$R/config" ]]; then
    find "$R/config" -maxdepth 1 -type f -name 'images_*.zip' -delete
  fi

  # Empty locale stub dirs
  find "$R" -maxdepth 1 -type d -name '*.lproj' -exec rm -rf {} +

  # Embedded Python runtime (~80 MB) — unused for --convert-to pdf
  rm -rf "$F/LibreOfficePython.framework"

  # Helper binaries unused for headless convert
  rm -f \
    "$M/gengal" \
    "$M/opencltest" \
    "$M/regview" \
    "$M/xpdfimport" \
    "$M/senddoc"

  # Keep Western / metric-compatible fonts; drop CJK and specialty faces
  local FT="$R/fonts/truetype"
  if [[ -d "$FT" ]]; then
    local keep_dir="$FT/.bkoab-keep"
    mkdir -p "$keep_dir"
    local f base
    shopt -s nullglob
    for f in "$FT"/*; do
      [[ -f "$f" ]] || continue
      base="$(basename "$f")"
      case "$base" in
        *Liberation*|*DejaVu*|*Carlito*|*Caladea*|*FreeSans*|*FreeSerif*|*FreeMono*|opens___*)
          mv "$f" "$keep_dir/"
          ;;
      esac
    done
    local kept
    kept="$(find "$keep_dir" -type f | wc -l | tr -d ' ')"
    if [[ "$kept" -ge 8 ]]; then
      find "$FT" -maxdepth 1 -type f -delete
      mv "$keep_dir"/* "$FT/" 2>/dev/null || true
    else
      mv "$keep_dir"/* "$FT/" 2>/dev/null || true
      echo "Hinweis: Font-Trim übersprungen (nur $kept Treffer)."
    fi
    rmdir "$keep_dir" 2>/dev/null || true
    shopt -u nullglob
  fi

  # Do NOT delete Calc/Impress/Math dylibs — macOS SIGKILLs a broken Frameworks set.
  # Do NOT remove Resources/presets — headless first-run can hang without them.

  after="$(du -sk "$app" | awk '{print $1}')"
  echo "LibreOffice gestrippt für PDF: $(( before / 1024 ))MB → $(( after / 1024 ))MB"

  # Stripping invalidates the TDF code signature; macOS then SIGKILLs soffice.
  # Ad-hoc re-sign here so convert works; build_app.sh re-signs with Developer ID.
  if command -v codesign >/dev/null 2>&1; then
    echo "Ad-hoc-Signatur für gestripptes LibreOffice …"
    codesign --force --deep --sign - "$app" >/dev/null
  fi
  xattr -cr "$app" 2>/dev/null || true
}

strip_libreoffice_for_pdf "$APP_DEST"

if [[ ! -x "${APP_DEST}/Contents/MacOS/soffice" ]]; then
  echo "Strip fehlgeschlagen — soffice fehlt."
  exit 1
fi

# Size hint for builders
du -sh "$APP_DEST" || true
echo "LibreOffice gebündelt ✓"
