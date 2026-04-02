#!/usr/bin/env bash
# Fetch category index from AgentPowers API on session start.
set -e

AP_API_BASE="${AP_API_BASE:-https://api.agentpowers.ai}"

categories=$(curl -sf -H "Accept: text/plain" "${AP_API_BASE}/v1/categories" 2>/dev/null || echo "")

if [ -z "$categories" ]; then
  exit 0
fi

escaped=$(echo "$categories" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))" 2>/dev/null || echo '""')

cat <<EOF
{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":${escaped}}}
EOF
