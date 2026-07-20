#!/usr/bin/env bash
# Uptime watchdog for the FlowLog playground backend.
#
# Checks the *public* tunnel path end-to-end (tunnel + backend) by curling the
# current URL's /health. On success it pings a Healthchecks.io URL; if those
# pings stop — tunnel down, backend down, or the whole node rebooted —
# Healthchecks.io emails you after the grace period (a "dead man's switch").
#
# The ping URL comes from $HC_PING_URL or .run/hc-ping-url (env wins). With no
# ping URL it just prints/logs UP/DOWN, which is still useful by hand.
#
# Run once:   bash scripts/monitor.sh
# Every 5m:   make monitor-install   (installs a cron entry)
set -uo pipefail
cd "$(dirname "$0")/.."

RUN_DIR=".run"
CLOUDFLARED_LOG="$RUN_DIR/cloudflared.log"

# Ping URL: env first, then the .run/hc-ping-url file.
PING_URL="${HC_PING_URL:-}"
if [ -z "$PING_URL" ] && [ -f "$RUN_DIR/hc-ping-url" ]; then
  PING_URL="$(tr -d '[:space:]' < "$RUN_DIR/hc-ping-url")"
fi

# Current public URL: the cloudflared log is truncated on each start, so the
# first trycloudflare URL in it is the live quick-tunnel URL.
URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$CLOUDFLARED_LOG" 2>/dev/null | head -1)"

status="DOWN"; code="n/a"
if [ -n "$URL" ]; then
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$URL/health" 2>/dev/null || echo 000)"
  [ "$code" = "200" ] && status="UP"
fi

echo "$(date -u '+%Y-%m-%dT%H:%M:%SZ')  $status  url=${URL:-none}  health=$code"

# Ping Healthchecks.io only while healthy. Missed pings (past the check's grace
# period) are what triggers the email, so a single transient blip won't alert —
# only sustained downtime (or the whole node going away) does.
if [ -n "$PING_URL" ] && [ "$status" = "UP" ]; then
  curl -fsS -m 10 "$PING_URL" >/dev/null 2>&1 || true
fi

[ "$status" = "UP" ]
