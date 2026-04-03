# AgentPowers Plugin for Claude Code

Search, browse, and install premium skills and agents from the [AgentPowers marketplace](https://agentpowers.ai) directly in your Claude Code conversations.

## Install

Add the MCP server to your Claude Code config:

```bash
claude mcp add agentpowers -- npx -y @agentpowers/mcp-server
```

Or add manually to `.mcp.json`:

```json
{
  "mcpServers": {
    "agentpowers": {
      "command": "npx",
      "args": ["@agentpowers/mcp-server"]
    }
  }
}
```

> **Note:** Plugin marketplace support (`claude plugin install`) is coming soon.

## What You Get

- **26 MCP tools** for searching, browsing, purchasing, installing, and managing marketplace skills
- **4 MCP resources** for proactive marketplace and account context
- **2 MCP prompts** for guided skill discovery and purchase workflows
- **`/ap` command** for a guided marketplace experience
- **Proactive suggestions** when Claude detects a task that a marketplace skill could help with
- **Session hooks** that keep your marketplace context fresh
- **12+ platform support** including Claude Code, Claude Desktop, Cursor, Codex, Windsurf, Gemini CLI, and more

## Quick Start

After installing, try:

- Type `/ap` and choose "Search" to find skills
- Ask Claude "find me a code review skill" and it will search the marketplace
- Say "what skills do I have installed?" to see your collection
- Say "log me in to AgentPowers" to authenticate
- Say "show me the security results for prompt-improver" to check a skill

## Available Tools

### Discovery

| Tool | Description |
|------|-------------|
| `search_marketplace` | Search by keyword, category, or type |
| `search_skills` | Compatibility alias for search_marketplace |
| `get_skill_details` | View full details for a skill or agent |
| `get_categories` | List marketplace categories with counts |
| `get_seller_profile` | View a seller's profile and published skills |
| `get_skill_reviews` | Read reviews for a specific skill |
| `get_security_results` | View security scan results and trust level |
| `get_platforms` | List all 12+ supported AI platforms |
| `get_marketplace_snapshot` | Quick health check of API, account, and stats |
| `get_openapi_summary` | Summarize the AgentPowers API schema |

### Account

| Tool | Description |
|------|-------------|
| `login_account` | Browser-based login (opens auth page) |
| `logout_account` | Log out and clear credentials |
| `whoami_account` | Show current identity from CLI and API |
| `get_account_profile` | Fetch your full account profile |

### Purchasing

| Tool | Description |
|------|-------------|
| `list_purchases` | List your purchases with license codes |
| `start_checkout` | Create a Stripe checkout session for a paid skill |
| `check_purchase_status` | Poll purchase status; optionally wait and auto-install |
| `confirm_purchase_session` | Confirm purchase by Stripe session ID |
| `download_purchased_skill` | Get download URL for a purchased skill package |

### Installation

| Tool | Description |
|------|-------------|
| `install_skill` | Full automation: detect price, checkout if needed, install |
| `install_purchased_skill` | Install using a previous purchase or license code |
| `check_installed` | List all installed skills with version/edit status |
| `uninstall_skill` | Remove a skill from one or all platforms |
| `check_for_updates` | Compare installed versions against marketplace |
| `check_plugin_version` | Check if a newer version of this plugin is available |

## Resources

The plugin exposes MCP resources that Claude can read proactively:

- `agentpowers://marketplace/snapshot` -- Live API health, skill count, and account status
- `agentpowers://account/purchases` -- Your current purchase list (requires auth)
- `agentpowers://docs/openapi-summary` -- Summary of the AgentPowers OpenAPI spec
- `agentpowers://plugin/version` -- Current plugin version and update availability

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
