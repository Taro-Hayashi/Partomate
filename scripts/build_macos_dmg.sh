#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
APP_PATH="$BACKEND_DIR/dist/Partomate.app"
DMG_PATH="$BACKEND_DIR/dist/Partomate.dmg"
PYTHON_BIN="${PYTHON_BIN:-$BACKEND_DIR/venv/bin/python}"
CODESIGN_IDENTITY="${PARTOMATE_CODESIGN_IDENTITY:-}"
NOTARY_PROFILE="${PARTOMATE_NOTARY_PROFILE:-partomate-notary}"

if [[ -z "$CODESIGN_IDENTITY" ]]; then
  echo "PARTOMATE_CODESIGN_IDENTITY is required." >&2
  exit 1
fi

if [[ ! -x "$PYTHON_BIN" ]]; then
  echo "Python was not found at $PYTHON_BIN." >&2
  exit 1
fi

command -v hdiutil >/dev/null
command -v xcrun >/dev/null

(
  cd "$ROOT_DIR/frontend"
  npm run build
)

(
  cd "$BACKEND_DIR"
  PARTOMATE_CODESIGN_IDENTITY="$CODESIGN_IDENTITY" \
    "$PYTHON_BIN" -m PyInstaller partomate_desktop.spec --noconfirm
)

codesign --verify --deep --strict --verbose=2 "$APP_PATH"

DMG_STAGING="$(mktemp -d)"
trap 'rm -rf "$DMG_STAGING"' EXIT

cp -R "$APP_PATH" "$DMG_STAGING/Partomate.app"
ln -s /Applications "$DMG_STAGING/Applications"

hdiutil create \
  -volname "Partomate" \
  -srcfolder "$DMG_STAGING" \
  -ov \
  -format UDZO \
  "$DMG_PATH"

codesign --force --sign "$CODESIGN_IDENTITY" --timestamp "$DMG_PATH"
codesign --verify --verbose=2 "$DMG_PATH"

xcrun notarytool submit "$DMG_PATH" \
  --keychain-profile "$NOTARY_PROFILE" \
  --wait
xcrun stapler staple "$DMG_PATH"
xcrun stapler validate "$DMG_PATH"
spctl --assess --type open \
  --context context:primary-signature \
  --verbose=2 \
  "$DMG_PATH"

echo "Created signed and notarized DMG: $DMG_PATH"
