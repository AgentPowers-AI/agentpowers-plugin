---
name: ap
description: Search, browse, install, and manage AgentPowers marketplace skills and agents. Use when the user invokes `/ap` with or without a subcommand (search, detail, install, uninstall, list, updates, purchases, categories, reviews, profile, help), or when they want to find, preview, install, or manage marketplace content.
---

# AgentPowers Marketplace

You have MCP tools from the AgentPowers plugin. Use them to help the user interact with the marketplace.

## Subcommand pattern

When the user invokes `/ap` followed by text, parse the first word as a subcommand and the rest as arguments. Subcommands are case-insensitive. Unknown subcommands fall through to a search with the full text as the query.

| User says | What to do |
|---|---|
| `/ap` (bare, no args) | Show the help menu below, then ask what they'd like to do. |
| `/ap help` | Show the help menu below. |
| `/ap search <query>` | Call `search_marketplace` with the query. If no query, ask what they're looking for. |
| `/ap detail <slug>` | Call `get_skill_details` with the slug. |
| `/ap install <slug>` | Call `get_skill_details` first to check price + security. If free: ask "install?" then call `install_skill`. If paid: explain checkout flow, call `start_checkout`. |
| `/ap uninstall <slug>` | Call `uninstall_skill` with the slug. Confirm briefly first ("Uninstall X?"). |
| `/ap list` or `/ap installed` | Call `check_installed` and present results. |
| `/ap updates` | Call `check_for_updates` to see which installed skills have newer versions. |
| `/ap categories` | Call `get_categories` and present the list. |
| `/ap reviews <slug>` | Call `get_skill_reviews` for that slug. |
| `/ap profile` | Call `get_account_profile`. |
| `/ap purchases` | Call `list_purchases`. |
| `/ap <anything else>` | Treat as an open-ended search query: call `search_marketplace` with the full text. |

**Implicit fallthrough:** if the user types `/ap code review helper`, that's equivalent to `/ap search code review helper`. Don't refuse unrecognized text — search is the safe default.

## Help menu (shown on bare `/ap` or `/ap help`)

```
AgentPowers — paid marketplace for Claude skills & agents

COMMON
  /ap search <query>       Search the marketplace
  /ap detail <slug>        Show full details for a skill
  /ap install <slug>       Install a free skill (or start checkout for paid)
  /ap uninstall <slug>     Remove an installed skill
  /ap list                 List what you have installed
  /ap updates              Check for updates to installed skills

DISCOVERY
  /ap categories           Browse all categories
  /ap reviews <slug>       Show reviews for a skill

ACCOUNT
  /ap profile              Your AgentPowers profile
  /ap purchases            Skills you've purchased

Tip: `/ap <anything>` without a subcommand treats the rest as a search query.
Type the command, and I'll handle it.
```

## How to present results

- **Search results:** Show a clean list with name, one-line description, price (Free or $X.XX), security status (verified/warning). Keep it tight — 5 results max unless the user asks for more.
- **Details:** Call `get_skill_details` and present full description, author, version, install count, security status, and a one-line install hint.
- **Install:** For free skills, ask "Want me to install this?" before calling `install_skill`. For paid skills, explain the price + that a browser opens for checkout, then call `start_checkout` only after they confirm.
- **Uninstall:** Confirm briefly ("Uninstall `foo-skill`?"), then call `uninstall_skill`. Don't re-prompt more than once.

## Guidelines

- One suggestion at a time. Don't overwhelm with long lists.
- If search returns no results, suggest broadening the query or trying a different category.
- After installing a skill, read its SKILL.md so you know how to use it immediately.
- Never be pushy about paid skills. Mention the price once and let the user decide.
- If the user types a slug that looks misspelled (e.g. `/ap install pretex` when `pretext-layout` exists), try `search_marketplace` with that string and show close matches before erroring.
- **Slash commands are NOT direct activators for installed skills.** If the user types `/pretext-layout` expecting to trigger the installed skill, remind them: skills activate by relevance to the task, not by slash. Only plugin commands (like `/ap` itself) use the slash syntax.
