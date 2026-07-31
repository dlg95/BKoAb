#!/usr/bin/env bash
# Optional: install LibreOffice as PDF fallback (primary engine is dxpdf).
# Licensing: LibreOffice is MPL-2.0 — see https://www.libreoffice.org/licenses/
# and THIRD_PARTY_NOTICES.md.
set -euo pipefail

soffice_available() {
  if [[ -n "${BKOAB_SOFFICE:-}" && -x "${BKOAB_SOFFICE}" ]]; then
    return 0
  fi
  if command -v soffice >/dev/null 2>&1; then
    return 0
  fi
  if command -v libreoffice >/dev/null 2>&1; then
    return 0
  fi
  local candidates=(
    "/Applications/LibreOffice.app/Contents/MacOS/soffice"
    "/opt/homebrew/bin/soffice"
    "/usr/local/bin/soffice"
    "/usr/bin/soffice"
    "/usr/lib/libreoffice/program/soffice"
  )
  local c
  for c in "${candidates[@]}"; do
    [[ -x "$c" ]] && return 0
  done
  return 1
}

if soffice_available; then
  echo "LibreOffice (soffice) gefunden — PDF-Export bereit."
  exit 0
fi

OS="$(uname -s)"
echo "LibreOffice fehlt — wird für den PDF-Export der Abrechnung benötigt."

if [[ "$OS" == "Darwin" ]]; then
  if command -v brew >/dev/null 2>&1; then
    echo "Installiere LibreOffice per Homebrew (MPL-2.0) …"
    brew install --cask libreoffice
  else
    echo "Homebrew nicht gefunden. Bitte LibreOffice installieren:"
    echo "  https://www.libreoffice.org/download/"
    echo "  oder: brew install --cask libreoffice"
    exit 1
  fi
elif [[ "$OS" == "Linux" ]]; then
  if command -v apt-get >/dev/null 2>&1; then
    echo "Installiere LibreOffice Writer (ohne GUI) per apt …"
    if [[ "$(id -u)" -eq 0 ]]; then
      apt-get update
      DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        libreoffice-writer-nogui
    elif command -v sudo >/dev/null 2>&1; then
      sudo apt-get update
      sudo DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        libreoffice-writer-nogui
    else
      echo "Kein root/sudo für apt. Bitte manuell: apt install libreoffice-writer-nogui"
      exit 1
    fi
  elif command -v dnf >/dev/null 2>&1; then
    echo "Installiere LibreOffice per dnf …"
    if [[ "$(id -u)" -eq 0 ]]; then
      dnf install -y libreoffice-writer
    elif command -v sudo >/dev/null 2>&1; then
      sudo dnf install -y libreoffice-writer
    else
      echo "Kein root/sudo für dnf. Bitte manuell: dnf install libreoffice-writer"
      exit 1
    fi
  else
    echo "Kein unterstützter Paketmanager. Bitte LibreOffice manuell installieren."
    exit 1
  fi
else
  echo "Unbekanntes OS ($OS). Bitte LibreOffice manuell installieren."
  exit 1
fi

if soffice_available; then
  echo "LibreOffice installiert — PDF-Export bereit."
  exit 0
fi

echo "LibreOffice-Installation abgeschlossen, aber soffice wurde nicht gefunden."
exit 1
