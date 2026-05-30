#!/usr/bin/env bash
# Poll seed status until no job is running/pending (or timeout). grep-based.
cd /home/deploy/rumahquran.id
KEY=$(grep '^SEED_ADMIN_KEY=' .env | cut -d= -f2)
LOG=/home/deploy/rumahquran.id/logs/seed-progress.log
URL=http://127.0.0.1:3000/api/v1/seed/status
deadline=$(( $(date +%s) + 3600 ))
while :; do
  json=$(curl -s -m 15 "$URL" -H "x-seed-admin-key: $KEY")
  ts=$(date -u +%T)
  done_ayat=$(curl -s -m 10 "http://127.0.0.1:3000/api/v1/seed/status/ayat" -H "x-seed-admin-key: $KEY" 2>/dev/null | grep -o '"doneItems":[0-9]*' | head -1)
  running=$(printf '%s' "$json" | grep -o '"status":"running"' | wc -l)
  pending=$(printf '%s' "$json" | grep -o '"status":"pending"' | wc -l)
  failed=$(printf '%s' "$json" | grep -o '"status":"failed"' | wc -l)
  completed=$(printf '%s' "$json" | grep -o '"status":"completed"' | wc -l)
  echo "[$ts] running=$running pending=$pending completed=$completed failed=$failed ($done_ayat)" >> "$LOG"
  if [ "$running" -eq 0 ] && [ "$pending" -eq 0 ]; then echo "[$ts] ALL TERMINAL" >> "$LOG"; break; fi
  if [ "$(date +%s)" -ge "$deadline" ]; then echo "[$ts] TIMEOUT" >> "$LOG"; break; fi
  sleep 20
done
echo "=== final job statuses ===" >> "$LOG"
curl -s -m 15 "$URL" -H "x-seed-admin-key: $KEY" >> "$LOG"
echo "" >> "$LOG"
echo "=== final row counts ===" >> "$LOG"
sudo -n -u postgres psql -d quran_db -At -c \
  "SELECT 'surahs='||count(*) FROM surahs UNION ALL SELECT 'ayat='||count(*) FROM ayat UNION ALL SELECT 'doa='||count(*) FROM doa UNION ALL SELECT 'tafsir='||count(*) FROM tafsir UNION ALL SELECT 'kota='||count(*) FROM kota;" >> "$LOG" 2>&1
tail -8 "$LOG"
