#!/usr/bin/env bash
# Refresh the backend payload fixture used by tests/contract.test.ts.
#
# The contract test compares what the backend actually sends against what the
# Zod schema declares. When the backend payload changes, re-capture here and
# let the test tell you which new field needs adding to the schema.
#
#   ./scripts/refresh-contract-fixture.sh
#
# Refreshing is expected to fail the test on purpose whenever the backend grew
# a field — that failure is the signal, not a problem.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$REPO_ROOT/tests/fixtures/rss-backend-sample.json"
API="${RSS_API_URL:-http://127.0.0.1:3000/api/v1/rss?limit=25}"
TOKEN="${RSS_API_TOKEN:-${API_TOKEN:-}}"

if [[ -z "$TOKEN" ]]; then
  echo "Set RSS_API_TOKEN (or API_TOKEN) to a monitor token with RSS read access." >&2
  echo "It is read from the environment and never written to disk." >&2
  exit 1
fi

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

curl -fsS -H "Authorization: Bearer $TOKEN" "$API" -o "$tmp"

python3 - "$tmp" "$OUT" <<'PY'
import json, sys
src, dst = sys.argv[1], sys.argv[2]
with open(src) as f:
    data = json.load(f)
rows = (data.get("data") or {}).get("results")
if not rows:
    sys.exit("backend returned no results — fixture not written")
# Strip anything session-specific so the fixture can be committed.
clean = {"data": {"results": rows}}
with open(dst, "w") as f:
    json.dump(clean, f, indent=2, sort_keys=True)
    f.write("\n")
keys = sorted({k for r in rows for k in r})
print(f"wrote {len(rows)} rows, {len(keys)} distinct keys to {dst}")
print("  " + " ".join(keys))
PY

echo
echo "Now run: npx vitest run tests/contract.test.ts"
