#!/usr/bin/env bash
#
# sync-portfolio.sh — one-way sync of the portfolio SITE files from the sidecar
# workspace into this standalone repo. Compares by PRETTIER-NORMALIZED content
# (so whitespace/formatting never counts as a change), previews a diff, gates on
# accessibility, commits locally, and offers to push once a GitHub remote exists.
#
# Usage:  ./scripts/sync-portfolio.sh

set -euo pipefail

SRC="/Users/Anna/sidecar/anna/portfolio/site"
DST="$HOME/annaneiman-portfolio"
PRETTIER="$DST/tests/node_modules/.bin/prettier"
PRC="$DST/tests/.prettierrc.json"

HTML_FILES=(index.html marketplace.html case-2.html case-3.html case-4.html case-5.html)
CSS_FILES=(assets/styles.css assets/index.css assets/case-study.css)
BIN_FILES=(resume.pdf)
ASSET_DIRS=(assets/books)   # image dirs compared by checksum

echo "==> Portfolio sync: sidecar -> standalone repo"
echo "    source: $SRC"
echo "    dest:   $DST"
echo

[ -x "$PRETTIER" ] || { echo "   (installing harness deps for comparison...)"; (cd "$DST/tests" && npm install --silent >/dev/null 2>&1); }

# normalized-content comparison for text files; returns 0 if SAME, 1 if DIFFERENT
same_norm() {
  local src="$1" dst="$2"
  [ -f "$src" ] || return 0
  [ -f "$dst" ] || return 1
  local a b
  a=$("$PRETTIER" --config "$PRC" "$src" 2>/dev/null | shasum | cut -d' ' -f1)
  b=$("$PRETTIER" --config "$PRC" "$dst" 2>/dev/null | shasum | cut -d' ' -f1)
  [ "$a" = "$b" ]
}

echo "==> Real content changes that would sync:"
changed=0
declare -a TO_COPY_TEXT=()
for f in "${HTML_FILES[@]}" "${CSS_FILES[@]}"; do
  if ! same_norm "$SRC/$f" "$DST/$f"; then echo "    M  $f"; TO_COPY_TEXT+=("$f"); changed=1; fi
done
for f in "${BIN_FILES[@]}"; do
  if ! cmp -s "$SRC/$f" "$DST/$f" 2>/dev/null; then echo "    M  $f"; changed=1; fi
done
for d in "${ASSET_DIRS[@]}"; do
  while IFS= read -r line; do
    [ -n "$line" ] && { echo "    [$d] $line"; changed=1; }
  done < <(rsync -rin --checksum --delete "$SRC/$d/" "$DST/$d/" 2>/dev/null \
            | awk '$1 ~ /deleting/ || $1 ~ /\+\+\+\+/ || substr($1,3,2) ~ /[cs]/ {print $2" ("$1")"}')
done

if [ "$changed" -eq 0 ]; then
  echo "    (nothing to sync — repo already matches sidecar)"
  exit 0
fi

echo
read -r -p "==> Apply these changes to the repo? [y/N] " ans
case "$ans" in [yY]|[yY][eE][sS]) ;; *) echo "Aborted — nothing changed."; exit 0 ;; esac

# copy site files
for f in "${HTML_FILES[@]}" "${CSS_FILES[@]}" "${BIN_FILES[@]}"; do
  [ -f "$SRC/$f" ] && cp "$SRC/$f" "$DST/$f"
done
for d in "${ASSET_DIRS[@]}"; do rsync -r --checksum --delete "$SRC/$d/" "$DST/$d/"; done
echo "==> Files copied."

# verification gate: format to repo standard, then axe
echo "==> Verifying (prettier format + axe a11y)..."
cd "$DST/tests"
"$PRETTIER" --config "$PRC" --write ../index.html ../marketplace.html ../case-*.html ../assets/*.css >/dev/null 2>&1 || true
if ! node axe.mjs >/tmp/axe-sync.log 2>&1; then
  echo "    !! axe found violations — NOT committing:"; tail -20 /tmp/axe-sync.log; exit 1
fi
echo "    axe: PASS (0 violations)"

# commit
cd "$DST"
git add index.html marketplace.html case-*.html assets/ resume.pdf 2>/dev/null || true
if git diff --cached --quiet; then echo "==> Nothing to commit after formatting."; exit 0; fi
read -r -p "==> Commit message [Sync site update from sidecar]: " msg
msg="${msg:-Sync site update from sidecar}"
git commit -q -m "$msg"; echo "==> Committed: $msg"

# push (only if a remote exists)
if git remote | grep -q .; then
  read -r -p "==> Push to $(git remote | head -1)/$(git branch --show-current)? [y/N] " pa
  case "$pa" in [yY]|[yY][eE][sS]) git push "$(git remote | head -1)" "$(git branch --show-current)"; echo "==> Pushed." ;; *) echo "==> Skipped push." ;; esac
else
  echo "==> No git remote yet — committed locally only. Add one later to enable push."
fi
echo "==> Done."
