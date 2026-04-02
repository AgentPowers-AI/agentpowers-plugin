# AgentPowers Plugin for Claude Code

Search, browse, and install premium skills and agents from the [AgentPowers marketplace](https://agentpowers.ai) directly in your Claude Code conversations.

## Install

```bash
claude plugin add AgentPowers-AI/agentpowers-plugin
```

## What You Get

- **7 MCP tools** for searching, browsing, installing, and managing marketplace skills
- **`/ap` command** for a guided marketplace experience
- **Proactive suggestions** when Claude detects a task that a marketplace skill could help with
- **Session hooks** that keep your marketplace context fresh

## Quick Start

After installing, try:

- Type `/ap` and choose "Search" to find skills
- Ask Claude "find me a code review skill" and it will search the marketplace
- Say "what skills do I have installed?" to see your collection

## Available Tools

| Tool | Description |
|------|-------------|
| `search_marketplace` | Search by keyword, category, or type |
| `get_skill_details` | View full details for a skill or agent |
| `install_skill` | Download and install (free or paid) |
| `check_purchase_status` | Check payment status for a purchase |
| `check_installed` | List all installed skills and agents |
| `uninstall_skill` | Remove an installed skill or agent |
| `check_for_updates` | Check for newer versions of installed skills |

## Authentication

For full features (including paid skills), log in via the CLI:

```bash
pip install agentpowers
ap login
```

The plugin picks up the token automatically from `~/.agentpowers/auth.json`.

## Alternatives

| Channel | Best For |
|---------|----------|
| **This plugin** | Richest experience in Claude Code |
| [Standalone skill](https://github.com/AgentPowers-AI/agentpowers-skill) | Zero-dependency, lightweight |
| [MCP Server](https://www.npmjs.com/package/@agentpowers/mcp-server) | Works in any MCP client |
| [CLI](https://pypi.org/project/agentpowers/) | Terminal workflows |

## License

MIT
