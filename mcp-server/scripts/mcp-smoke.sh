#!/usr/bin/env bash
# MCP server smoke test — verifies the server starts and exposes all 12 tools.
# Run from the mcp-server directory: ./scripts/mcp-smoke.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MCP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$MCP_DIR"

EXPECTED_TOOLS=(
  "search_marketplace"
  "get_skill_details"
  "install_skill"
  "check_purchase_status"
  "check_installed"
  "uninstall_skill"
  "check_for_updates"
  "get_categories"
  "get_skill_reviews"
  "start_checkout"
  "get_account_profile"
  "list_purchases"
)

echo "=== AgentPowers MCP Server Smoke Test ==="
echo ""

# 1. Build
echo "[1/3] Building..."
npm run build --silent
echo "      dist/index.js: $(wc -c < dist/index.js | tr -d ' ') bytes"

# 2. Send MCP handshake + tools/list.
# The MCP SDK stdio transport keeps stdin open waiting for more input; we kill after
# 5s to give the server time to respond even on slow/cold CI runners.
echo "[2/3] Sending MCP initialize + tools/list..."
MCP_INPUT=$(printf '%s\n%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke-test","version":"1.0.0"}}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}')

RESPONSE=$(
  (echo "$MCP_INPUT" | node dist/index.js 2>/dev/null) &
  SERVER_PID=$!
  sleep 5
  kill "$SERVER_PID" 2>/dev/null
  wait "$SERVER_PID" 2>/dev/null || true
)

if [ -z "$RESPONSE" ]; then
  echo "      ERROR: No response from server."
  exit 1
fi

# 3. Verify all 12 tool names appear in response
echo "[3/3] Verifying tools..."
MISSING=()
for tool in "${EXPECTED_TOOLS[@]}"; do
  if echo "$RESPONSE" | grep -q "\"$tool\""; then
    echo "      [PASS] $tool"
  else
    echo "      [FAIL] $tool — not found in response"
    MISSING+=("$tool")
  fi
done

echo ""
if [ ${#MISSING[@]} -eq 0 ]; then
  echo "=== SMOKE TEST PASSED: all ${#EXPECTED_TOOLS[@]} tools present ==="
  exit 0
else
  echo "=== SMOKE TEST FAILED: ${#MISSING[@]} tool(s) missing: ${MISSING[*]} ==="
  exit 1
fi
