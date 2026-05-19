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
slug=$(echo "$input" | node -e "
let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
  try{const o=JSON.parse(d);
  const texts=(o.result?.content||[]).map(c=>c.text||'').join(' ');
  const m=texts.match(/installed.*?\/(?:skills|agents)\/([a-z0-9_-]+)/i);
  if(m)console.log(m[1].toLowerCase());}catch{}
});" 2>/dev/null || echo "")

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
