#!/usr/bin/env bash
# Daily SSL expiry monitor for rumahquran.id.
#
# The TLS cert is a manual-renew Sectigo cert (no certbot/ACME auto-renew), so
# this guards against forgetting to renew. Starting WARN_DAYS before expiry it
# shouts via: journald (logger), a logfile, an SSH login banner (/etc/motd.d so
# you see it every time you log in), and email if `mail`/`sendmail` is set up.
#
# To actually renew, see scripts/ssl-install-cert.sh.
# Installed as a daily root cron job: /etc/cron.d/rumahquran-ssl-monitor
set -euo pipefail

CERT="${SSL_CERT:-/etc/nginx/ssl/rumahquran.id.fullchain.pem}"
DOMAIN="rumahquran.id"
WARN_DAYS="${WARN_DAYS:-30}"
CRIT_DAYS="${CRIT_DAYS:-7}"
ALERT_EMAIL="${ALERT_EMAIL:-aeriparfum@gmail.com}"
LOGDIR="/home/deploy/rumahquran.id/logs"
LOGFILE="$LOGDIR/ssl-monitor.log"
MOTD="/etc/motd.d/99-rumahquran-ssl"

mkdir -p "$LOGDIR"
ts() { date '+%Y-%m-%d %H:%M:%S'; }

if [[ ! -r "$CERT" ]]; then
  echo "$(ts) ERROR cert not readable: $CERT" | tee -a "$LOGFILE"
  logger -t rumahquran-ssl "ERROR: cert not readable: $CERT" 2>/dev/null || true
  exit 1
fi

end_human=$(openssl x509 -enddate -noout -in "$CERT" | cut -d= -f2)
end_epoch=$(date -d "$end_human" +%s)
now_epoch=$(date +%s)
days_left=$(( (end_epoch - now_epoch) / 86400 ))

line="$(ts) SSL $DOMAIN expires in ${days_left} day(s) (${end_human})"
echo "$line" >> "$LOGFILE"

if (( days_left <= WARN_DAYS )); then
  level="WARNING"
  (( days_left <= CRIT_DAYS )) && level="CRITICAL"
  msg="[$level] Sertifikat SSL $DOMAIN tinggal ${days_left} hari (kadaluwarsa ${end_human}). Perpanjang sekarang: beli cert baru lalu jalankan 'sudo /home/deploy/rumahquran.id/scripts/ssl-install-cert.sh <leaf.crt> <chain.crt> <key>'."
  logger -t rumahquran-ssl "$msg" 2>/dev/null || true
  mkdir -p "$(dirname "$MOTD")" 2>/dev/null || true
  {
    echo "============================================================"
    echo " WARNING  $msg"
    echo "============================================================"
  } > "$MOTD" 2>/dev/null || true
  chmod 644 "$MOTD" 2>/dev/null || true
  if command -v mail >/dev/null 2>&1; then
    echo "$msg" | mail -s "[$level] SSL $DOMAIN ${days_left}d left" "$ALERT_EMAIL" 2>/dev/null || true
  elif command -v sendmail >/dev/null 2>&1; then
    printf 'Subject: [%s] SSL %s %sd left\n\n%s\n' "$level" "$DOMAIN" "$days_left" "$msg" \
      | sendmail "$ALERT_EMAIL" 2>/dev/null || true
  fi
  echo "$line  -> $level emitted"
else
  rm -f "$MOTD" 2>/dev/null || true
  echo "$line  -> OK"
fi
