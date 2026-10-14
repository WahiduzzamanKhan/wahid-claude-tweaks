# wahid-claude-tweaks

A [Claude Code plugin marketplace](https://code.claude.com/docs/en/plugins/create-marketplace) with my plugins and mods for Claude Code.

## Plugins

| Plugin | What it does |
| :- | :- |
| [color-preview](plugins/color-preview) | Paints each colour code in Claude's replies with the colour it names |
| [token-meter](plugins/token-meter) | Token, context window and quota meters above the prompt |

## Install

Add the marketplace once:

```bash
claude plugin marketplace add WahiduzzamanKhan/wahid-claude-tweaks
```

Then install any plugin from it by name:

```bash
claude plugin install color-preview@wahid-claude-tweaks
```

Inside a session, `/plugin` lists every plugin in the marketplace under **Discover**. To get new versions, run `claude plugin update <plugin>@wahid-claude-tweaks`, or turn on auto-update for this marketplace in `/plugin`. Plugins added to the marketplace later appear for you without adding it again.

Mods run with your permissions. Each plugin's README has a **What it can access** section listing what it does.

## Requirements

Claude Code v2.1.287 or later for the mods.

## License

[MIT](LICENSE)
