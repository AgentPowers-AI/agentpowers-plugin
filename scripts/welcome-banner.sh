#!/usr/bin/env bash
# Display AgentPowers welcome banner on session start.
# Outputs ANSI art to stderr (visible in terminal).
set -e

# Brand color: #5fbab8 (teal)
T='\033[38;2;95;186;184m'
B='\033[1m'
D='\033[2m'
R='\033[0m'

# Read plugin version from plugin.json
PLUGIN_DIR="${CLAUDE_PLUGIN_ROOT:-$(dirname "$(dirname "$0")")}"
VERSION=$(PLUGIN_DIR="$PLUGIN_DIR" node -e "console.log(require(process.env.PLUGIN_DIR + '/.claude-plugin/plugin.json').version ?? '0.1.0')" 2>/dev/null || echo "0.1.0")

>&2 printf "\n"
>&2 printf "  ${T}    ████${R}\n"
>&2 printf "  ${T}     ████${R}       ${B}AgentPowers${R}  ${D}v${VERSION}${R}\n"
>&2 printf "  ${T}      ████${R}      ${D}Premium Claude skills & agents${R}\n"
>&2 printf "  ${T} █${R}     ${T}████${R}     ${D}agentpowers.ai${R}\n"
>&2 printf "  ${T}███${R}     ${T}████${R}\n"
>&2 printf "  ${T}   ██████${R}\n"
>&2 printf "  ${T}    ████${R}\n"
>&2 printf "  ${T}     ██${R}\n"
>&2 printf "\n"
