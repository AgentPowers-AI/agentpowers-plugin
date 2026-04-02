#!/usr/bin/env bash
# After a skill install, remind Claude to read the new SKILL.md.
# This hook runs on PostToolUse for install_skill MCP tool calls.
set -e

# The tool result is passed via stdin as JSON
input=$(cat)

# Only act on successful installs (check for error indicators)
if echo "$input" | grep -q '"isError":\s*true' 2>/dev/null; then
  exit 0
fi

# Extract slug from the tool result text if possible
slug=$(echo "$input" | python3 -c "
import sys, json, re
try:
    data = json.load(sys.stdin)
    text = data.get('result', {}).get('content', [{}])[0].get('text', '')
    # Look for 'Installed <slug>' or 'installed to ~/.claude/skills/<slug>'
    m = re.search(r'installed to.*?/(?:skills|agents)/([a-z0-9-]+)', text, re.I)
    if m:
        print(m.group(1))
except Exception:
    pass
" 2>/dev/null || echo "")

if [ -n "$slug" ]; then
  # Check skills dir first, then agents
  skill_path="$HOME/.claude/skills/$slug/SKILL.md"
  agent_path="$HOME/.claude/agents/$slug"

  if [ -f "$skill_path" ]; then
    cat <<EOF
{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"A new skill was just installed at $skill_path. Read its SKILL.md to learn what it does and how to use it."}}
EOF
  elif [ -d "$agent_path" ]; then
    cat <<EOF
{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"A new agent was just installed at $agent_path. Check its files to learn what it does."}}
EOF
  fi
fi
