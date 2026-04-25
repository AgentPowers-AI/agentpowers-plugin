# AgentPowers Plugin for Claude Code

Search, browse, and install premium skills and agents from the [AgentPowers marketplace](https://agentpowers.ai) directly in your Claude Code conversations.

## Install

```bash
claude plugin add AgentPowers-AI/agentpowers-plugin
```

## What You Get

- **12 MCP tools** for searching, browsing, installing, and managing marketplace skills
- **`/ap` command** for a guided marketplace experience
- **Proactive suggestions** when Claude detects a task that a marketplace skill could help with
- **Session hooks** that keep your marketplace context fresh

## Quick Start

After installing, try:

- Type `/ap` to see the help menu and available subcommands
- `/ap search code review` — search the marketplace
- `/ap install truth-first-lite` — install a free skill directly
- `/ap list` — see what you have installed
- Or just talk naturally: "find me a code review skill" — Claude uses the same MCP tools under the hood.

### Subcommands

`/ap` accepts subcommands inline. If the first word after `/ap` isn't a known
command, the rest is treated as a search query.

| Command | Effect |
|---|---|
| `/ap search <query>` | Search the marketplace |
| `/ap detail <slug>` | Full details for a skill |
| `/ap install <slug>` | Install a free skill (or start checkout for paid) |
| `/ap uninstall <slug>` | Remove an installed skill |
| `/ap list` | List installed skills and agents |
| `/ap updates` | Check for updates to installed skills |
| `/ap categories` | Browse all categories |
| `/ap reviews <slug>` | Show reviews for a skill |
| `/ap profile` | View your AgentPowers profile |
| `/ap purchases` | View your purchase history |
| `/ap help` | Show the full help menu |
| `/ap <anything else>` | Treated as a search query |

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
| `get_categories` | Browse available skill categories |
| `get_skill_reviews` | Read reviews and ratings for a skill |
| `start_checkout` | Begin a Stripe checkout for a paid skill |
| `get_account_profile` | View your account profile |
| `list_purchases` | View your purchase history |

## Authentication

For full features (including paid skills), log in via the CLI:

```bash
npx @agentpowers/cli login
```

Or via the Python CLI:

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
| [CLI (npx)](https://www.npmjs.com/package/@agentpowers/cli) | Terminal workflows (recommended) |
| [CLI (pip)](https://pypi.org/project/agentpowers/) | Terminal workflows (Python) |

## License

MIT
