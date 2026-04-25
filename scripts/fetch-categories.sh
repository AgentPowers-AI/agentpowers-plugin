#!/usr/bin/env bash
# Fetch category index from AgentPowers API on session start.
set -e

AP_API_BASE="${AP_API_BASE:-https://api.agentpowers.ai}"

categories=$(curl -sf -H "Accept: text/plain" "${AP_API_BASE}/v1/categories" 2>/dev/null || echo "")

if [ -z "$categories" ]; then
  exit 0
fi

escaped=$(echo "$categories" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.stringify(d)))" 2>/dev/null || echo '""')

cat <<EOF
{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":${escaped}}}
EOF
