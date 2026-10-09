#!/usr/bin/env bash
# Publish freshly built site data files (used by the site-data refresh workflows).
#
# Usage: research/publish-site-data.sh "<commit message>" NEW_FILE:DEST [NEW_FILE:DEST ...]
#
# Each NEW_FILE is sanity-checked against the current DEST (research/check-site-data.py)
# when DEST is a site data file; if any check fails nothing is published and the
# script exits 1, so the workflow run shows as failed and the site keeps its data.
# Otherwise the files are copied into place, committed and pushed to main (Vercel
# then redeploys). No-op when nothing changed.
set -euo pipefail

msg="$1"; shift

# Commit (and re-commit during the rebase below) as the Actions bot.
export GIT_AUTHOR_NAME="github-actions[bot]" GIT_COMMITTER_NAME="github-actions[bot]"
export GIT_AUTHOR_EMAIL="41898282+github-actions[bot]@users.noreply.github.com" GIT_COMMITTER_EMAIL="41898282+github-actions[bot]@users.noreply.github.com"

for pair in "$@"; do
  new="${pair%%:*}"; dest="${pair#*:}"
  case "$dest" in
    lib/data/*) python research/check-site-data.py "$new" "$dest" ;;
  esac
done

for pair in "$@"; do
  new="${pair%%:*}"; dest="${pair#*:}"
  mkdir -p "$(dirname "$dest")"
  cp "$new" "$dest"
  git add "$dest"
done

if git diff --cached --quiet; then
  echo "Nothing changed - not committing."
  exit 0
fi

git commit -q -m "$msg"

# Someone may have pushed while the job ran: rebase onto the latest main and retry.
for attempt in 1 2 3; do
  if git pull -q --rebase origin main && git push -q origin HEAD:main; then
    echo "Published: $msg"
    exit 0
  fi
  git rebase --abort 2>/dev/null || true
  sleep $((attempt * 10))
done
echo "Couldn't push after 3 attempts" >&2
exit 1
