#!/usr/bin/env bash
# Sejmograf daily ETL on mixvm. Installed as ~/sejmograf/daily.sh, run by cron:
#
#   15 0 * * * /home/sejm/sejmograf/daily.sh      (VM clock is UTC)
#
# 00:15 UTC = 02:15 CEST / 01:15 CET, ahead of DeepSeek's weekday peak window
# (01-04 UTC); LLM steps that would start inside it are deferred, not paid 2x.
#
#   1. flock: skip if the previous run still holds the lock
#   2. newest v*.*.* tag -> exported once to ~/sejmograf/releases/<tag>
#   3. build the image from that release (cached layers) and keep the tag
#   4. one-shot `compose run daily` with the release's own compose file
#   5. refresh this script from the release for the next night
# Logs: ~/sejmograf/logs/daily-YYYYMMDD.log (30 days kept). The run ledger is
# `etl_runs` / the /admin/etl panel; exit code is the daily's.
set -euo pipefail

HOME_DIR=/home/sejm/sejmograf
cd "$HOME_DIR"

exec 9>"$HOME_DIR/daily.lock"
if ! flock -n 9; then
  echo "$(date -u +%FT%TZ) previous run still holds the lock, skipping" >> "$HOME_DIR/logs/daily-skip.log"
  exit 0
fi

mkdir -p logs releases illustrations
LOG="$HOME_DIR/logs/daily-$(date -u +%Y%m%d).log"
exec >>"$LOG" 2>&1
ts() { date -u +%FT%TZ; }
echo "=== $(ts) daily start ==="

git -C repo fetch --tags --prune --force origin
TAG=$(git -C repo tag --sort=-v:refname | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | head -1)
[ -n "$TAG" ] || { echo "FATAL: no v*.*.* tag"; exit 2; }
RELEASE="releases/$TAG"
if [ ! -d "$RELEASE" ]; then
  mkdir -p "$RELEASE.tmp"
  git -C repo archive "refs/tags/$TAG" | tar -x -C "$RELEASE.tmp"
  mv "$RELEASE.tmp" "$RELEASE"
fi
echo "release: $TAG ($(git -C repo rev-parse --short "refs/tags/$TAG^{commit}"))"

export SUPAGRAF_RELEASE_DIR="./$RELEASE"
compose=(sudo -n --preserve-env=SUPAGRAF_RELEASE_DIR /usr/bin/docker compose -p sejmograf
         --project-directory "$HOME_DIR" -f "$RELEASE/deploy/mixvm/docker-compose.yml" --profile jobs)

echo "--- $(ts) build ---"
"${compose[@]}" build daily
sudo -n /usr/bin/docker tag sejmograf/supagraf:local "sejmograf/supagraf:${TAG#v}"

echo "--- $(ts) supagraf daily ---"
rc=0
"${compose[@]}" run --rm daily || rc=$?

install -m 755 "$RELEASE/deploy/mixvm/daily.sh" "$HOME_DIR/daily.sh.next" && mv "$HOME_DIR/daily.sh.next" "$HOME_DIR/daily.sh"
find logs -name 'daily-2*.log' -mtime +30 -delete
ls -1d releases/v* 2>/dev/null | sort -V | head -n -3 | xargs -r rm -rf
echo "=== $(ts) daily end rc=$rc (tag=$TAG) ==="
exit "$rc"
