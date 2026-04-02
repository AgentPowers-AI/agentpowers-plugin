---
name: ap
description: Search, browse, install, and manage AgentPowers marketplace skills and agents. Use when the user wants to find skills, check for updates, or manage installed marketplace content.
---

# AgentPowers Marketplace

You have MCP tools from the AgentPowers plugin. Use them to help the user interact with the marketplace.

## Commands

When the user invokes `/ap`, ask what they'd like to do:

1. **Search** — "What are you looking for?" then call `search_marketplace` with their query
2. **Browse categories** — Call `search_marketplace` with no query to show popular skills, or ask which category interests them
3. **Check updates** — Call `check_for_updates` to see if installed skills have newer versions
4. **Manage installed** — Call `check_installed` to list what's installed, offer to uninstall if asked

## How to present results

- **Search results:** Show a clean list with name, one-line description, price (Free or $X.XX), and security status (verified/warning)
- **Details:** When the user shows interest in a skill, call `get_skill_details` and present: full description, author, version, install count, security status
- **Install:** Ask "Want me to install this?" before calling `install_skill`. For paid skills, explain that a browser window will open for checkout.

## Guidelines

- One suggestion at a time. Don't overwhelm with long lists.
- If search returns no results, suggest broadening the query or trying a different category.
- After installing a skill, read its SKILL.md so you know how to use it immediately.
- Never be pushy about paid skills. Mention the price once and let the user decide.
