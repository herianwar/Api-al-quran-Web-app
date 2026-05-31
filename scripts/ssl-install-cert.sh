#!/usr/bin/env bash
# One-command SSL renewal for rumahquran.id.
#
# Rebuilds the nginx fullchain (leaf + intermediate chain), verifies the private
# key matches the cert, backs up the current files, installs the new ones, tests
# the nginx config, and reloads. If the config test fails it auto-restores the
# backup so the site is never left with a broken cert.
#
# Usage (as root):
#   sudo scripts/ssl-install-cert.sh <leaf.crt> <chain-bundle.crt> <private.key>
#
#   leaf.crt         your new domain certificate (rumahquran_id.crt)
#   chain-bundle.crt the intermediate/root bundle (e.g. Chain_RootCA_Bundle)
#   private.key      the matching private key (unchanged across renewals if you
#                    reuse the same CSR; otherwise the new one)
set -euo pipefail

LEAF="${1:?leaf cert path required}"
CHAIN="${2:?chain bundle path required}"
KEY="${3:?private key path required}"
DEST_DIR="/etc/nginx/ssl"
DEST_FULL="$DEST_DIR/rumahquran.id.fullchain.pem"
DEST_KEY="$DEST_DIR/rumahquran.id.key"

if [[ $EUID -ne 0 ]]; then
  echo "ERROR: must run as root (use sudo)."; exit 1
fi
for f in "$LEAF" "$CHAIN" "$KEY"; do
  [[ -r "$f" ]] || { echo "ERROR: cannot read $f"; exit 1; }
done

# Verify the private key matches the leaf certificate.
cmod=$(openssl x509 -noout -modulus -in "$LEAF" 2>/dev/null | openssl md5 || true)
kmod=$(openssl rsa  -noout -modulus -in "$KEY"  2>/dev/null | openssl md5 || true)
if [[ -z "$kmod" || -z "$cmod" ]]; then
  # Fall back to a public-key compare (handles EC keys too).
  cmod=$(openssl x509 -in "$LEAF" -noout -pubkey 2>/dev/null | openssl md5 || true)
  kmod=$(openssl pkey -in "$KEY"  -pubout       2>/dev/null | openssl md5 || true)
fi
if [[ -z "$kmod" || "$cmod" != "$kmod" ]]; then
  echo "ERROR: private key does NOT match certificate. Aborting."; exit 1
fi
echo "OK: key matches certificate."

ts=$(date +%Y%m%d-%H%M%S)
[[ -f "$DEST_FULL" ]] && cp -a "$DEST_FULL" "$DEST_FULL.bak-$ts"
[[ -f "$DEST_KEY"  ]] && cp -a "$DEST_KEY"  "$DEST_KEY.bak-$ts"

tmp=$(mktemp)
{ cat "$LEAF"; echo; cat "$CHAIN"; } > "$tmp"
install -m 644 -o root -g root "$tmp" "$DEST_FULL"
install -m 600 -o root -g root "$KEY" "$DEST_KEY"
rm -f "$tmp"

if nginx -t; then
  systemctl reload nginx
  echo "OK: cert installed and nginx reloaded."
  echo "New expiry: $(openssl x509 -enddate -noout -in "$DEST_FULL" | cut -d= -f2)"
  echo "Backups: $DEST_FULL.bak-$ts , $DEST_KEY.bak-$ts"
else
  echo "ERROR: nginx config test failed — restoring previous cert."
  [[ -f "$DEST_FULL.bak-$ts" ]] && cp -a "$DEST_FULL.bak-$ts" "$DEST_FULL"
  [[ -f "$DEST_KEY.bak-$ts"  ]] && cp -a "$DEST_KEY.bak-$ts"  "$DEST_KEY"
  exit 1
fi
