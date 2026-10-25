#!/usr/bin/env bash
# Makes the release signing key for the mobile app and walks you through
# putting it where the release workflow and you can find it:
#
#   1. Makes a keystore with a new key and random passwords.
#   2. Copies each of the four values to the clipboard in turn, for the Gitea
#      Actions secrets.
#   3. Has you save the keystore file and passwords in your password manager.
#   4. Deletes the local copy.
#
# Run it once:
#
#   bash mobile/scripts/release-key-wizard.sh
#
# Every release must be signed with this key. If it's lost, the installed app
# can't be updated and has to be uninstalled, which deletes what it saved.

set -euo pipefail

SECRETS_URL='https://git.wispborne.com/david/hermes-ui/settings/actions/secrets'
ALIAS='hermes-release'

bold() { printf '\n\033[1m%s\033[0m\n' "$*"; }
pause() { read -r -p "$* Press Enter when done. " _; }

copy() {
  if command -v clip.exe >/dev/null; then
    printf '%s' "$1" | clip.exe
  elif command -v pbcopy >/dev/null; then
    printf '%s' "$1" | pbcopy
  elif command -v wl-copy >/dev/null; then
    printf '%s' "$1" | wl-copy
  elif command -v xclip >/dev/null; then
    printf '%s' "$1" | xclip -selection clipboard
  else
    return 1
  fi
}

if ! command -v keytool >/dev/null; then
  echo "keytool isn't on the PATH. It comes with the JDK 17 the Android build uses." >&2
  exit 1
fi

if ! command -v openssl >/dev/null; then
  echo "openssl isn't on the PATH. Git for Windows includes it." >&2
  exit 1
fi

work=$(mktemp -d)
keystore="$work/hermes-release.keystore"
trap 'rm -rf "$work"' EXIT

bold 'Step 1 of 4: make the key'
# PKCS12 keystores use one password for the store and the key.
password=$(openssl rand -base64 30 | tr -d '/+=' | cut -c1-32)
keytool -genkeypair -v \
  -keystore "$keystore" -storetype PKCS12 \
  -alias "$ALIAS" -keyalg RSA -keysize 4096 -validity 10950 \
  -storepass "$password" -keypass "$password" \
  -dname 'CN=Hermes mobile' >/dev/null 2>&1
echo "Made $keystore, valid for 30 years."
keytool -list -v -keystore "$keystore" -storepass "$password" | grep -E 'SHA256:' | head -n 1

bold 'Step 2 of 4: add the Gitea Actions secrets'
echo "Open $SECRETS_URL and add four secrets."
echo 'For each one, the value is copied to your clipboard. Paste it into Gitea, then come back here.'

add_secret() {
  local name=$1 value=$2

  if copy "$value"; then
    pause "  $name is on the clipboard. Add it as a secret named $name."
  else
    echo "  Couldn't reach the clipboard. The value for $name is:"
    echo "$value"
    pause "  Add it as a secret named $name."
  fi
}

add_secret HERMES_KEYSTORE_BASE64 "$(base64 < "$keystore" | tr -d '\n')"
add_secret HERMES_KEYSTORE_PASSWORD "$password"
add_secret HERMES_KEY_ALIAS "$ALIAS"
add_secret HERMES_KEY_PASSWORD "$password"
copy '' 2>/dev/null || true

bold 'Step 3 of 4: back it up in your password manager'
backup="$HOME/hermes-release.keystore"
cp "$keystore" "$backup"
echo "Make an entry named \"Hermes mobile release key\" with:"
echo "  - the file $backup attached"
echo "  - the alias: $ALIAS"
if copy "$password"; then
  echo '  - the password, which is on the clipboard now (the store and the key use the same one)'
else
  echo "  - the password (the store and the key use the same one): $password"
fi
pause '  Save the entry, then open it and check the file is attached.'
copy '' 2>/dev/null || true

bold 'Step 4 of 4: delete the local copy'
rm -f "$backup"
echo "Deleted $backup. The temporary copy is deleted when this script ends."

bold 'Done'
echo 'The next push to main that changes the version in mobile/app.json makes a signed release.'
