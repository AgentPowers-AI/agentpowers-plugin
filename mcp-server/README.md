# @agentpowers/mcp-server

MCP server for the [AgentPowers](https://agentpowers.ai) marketplace. Search, browse, install, and manage paid skills and agents directly inside Claude Code and Claude Cowork conversations.

## Tools

| Tool | Description |
|------|-------------|
| `search_marketplace` | Search for skills and agents by query, category, or type |
| `get_skill_details` | Get detailed info (price, security status, platforms, versions) for a skill |
| `install_skill` | Download and install a skill after security check |
| `check_purchase_status` | Check payment status and retrieve license code |
| `check_installed` | List all installed skills with version and edit status |
| `uninstall_skill` | Remove an installed skill and its version pin |
| `check_for_updates` | Check installed skills for newer versions |

## Setup

Add to your Claude Code MCP configuration (`~/.claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "agentpowers": {
      "command": "npx",
      "args": ["-y", "@agentpowers/mcp-server"]
    }
  }
}
```

Or install globally first:

```bash
npm install -g @agentpowers/mcp-server
```

Then configure with the global path:

```json
{
  "mcpServers": {
    "agentpowers": {
      "command": "agentpowers-mcp"
    }
  }
}
```

## Authentication

Most tools work without authentication. Installing paid skills and checking purchase status require a CLI auth token stored at `~/.agentpowers/auth.json`. Authenticate via:

```bash
npx @agentpowers/cli login
```

Or if you have the CLI installed:

```bash
ap login
```

## Configuration

The server connects to `https://api.agentpowers.ai` by default. Override with the `AGENTPOWERS_API_URL` environment variable for development.

## Security

Every skill listed on the marketplace passes a multi-layer security pipeline before listing, including static validation, dependency scanning, malware detection, and AI-powered security review. Security results are displayed in skill details.

## License

MIT
