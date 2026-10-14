# token-meter

A Claude Code [mod](https://code.claude.com/docs/en/plugins/mods/overview) that shows your token use, context window and plan quota on one line above the prompt.

```text
Tokens 1.2M ↑1.1M ↓84k  │  Context ██████████ 58%  │  5h █████ 61%   2h14m │ 7d █████ 18%   4d06h
```

In the terminal, the used part of each meter is coloured and the rest is drawn in your theme's inactive colour.

## What it shows

- **Tokens**: everything this session has sent and received, with input (including cache reads and writes) and output split out. When subagents have run, their share follows in brackets, as in `Tokens 1.2M ↑1.1M ↓84k (agents 300k)`; the total includes it.
- **Context**: how full the context window is.
- **Quota**: each plan limit (5-hour and 7-day windows) with how much is used and how long until it resets. On an API key or usage-credit billing there are no plan limits, so it shows what the session has cost instead.

Meters turn from your theme's success colour to its warning colour at 60%, and to its error colour at 85%; both thresholds can be changed in [Settings](#settings). Every colour comes from the Claude Code theme in use, so the line matches light, dark and custom themes.

The line adapts to the terminal width: the full line when it fits, then shorter meters with no input/output split, then numbers only, without the subagents' share. If even that is too wide, each section goes on its own row.

The reset countdowns update every minute, even while you're idle.

The token count is saved per session, so resuming a session, at launch or with `/resume`, shows its count straight away. `/clear` starts a new count.

## Settings

Run `/token-meter` to open the settings pane. Press a key to switch a part of the line on or off:

| Key | Setting |
| :- | :- |
| `1` | Show Tokens |
| `2` | Show the subagents' share after the total |
| `3` | Show Context |
| `4` | Show Quota |
| `5` | Show the hourglass before reset countdowns (switch off without a Nerd Font) |

To change where meters turn amber or red, press Tab to reach the **Amber from %** or **Red from %** field, type a whole number from 1 to 99, and press Enter. Each field shows the value in force, dimmed, until you type over it. Amber has to start below red; a value that doesn't fit is refused with the reason.

Everything is on by default, with amber from 60% and red from 85%. A preview under the settings shows the line with your current figures. Your choices are saved for every session on this machine and come back after `/clear`, `/resume` and `/branch`. Esc closes the pane.

## Install

```bash
claude plugin marketplace add WahiduzzamanKhan/wahid-claude-tweaks
claude plugin install token-meter@wahid-claude-tweaks
```

If you install or update it while a session is open, run `/reload-plugins` in that session.

## Requirements

- Claude Code **v2.1.287** or later in the terminal, or a Desktop app whose Code tab runs v2.1.286 or later.
- The reset countdown uses a [Nerd Font](https://www.nerdfonts.com/) hourglass icon. Without a Nerd Font, that one character shows as a blank or a box; switch it off with `5` in `/token-meter`.
- Another mod that draws in the band above the prompt, such as a skin's usage meters, shows under token-meter's line. If that mod runs first and draws the band without passing it on, it hides token-meter; turn one of them off.

## What it can access

A mod runs with your permissions, so here is everything this one does, as reported by `claude plugin validate`:

- **Hooks**: `session.start`, `classic.SessionStart` after `/clear`, `/resume` and `/branch`, `session.measure`, `turn.step`, `command.run` for `/token-meter`, and `ui.render` for its settings pane and for `AbovePrompt`
- **Calls**: `$.clock.every`/`now`, `$.command.register`, `$.session.id`, `$.session.usage`, `$.state.get`/`set`, `$.store.get`/`set`/`keys`/`delete`, `$.ui.invalidate`, `$.ui.open`, `$.ui.resolve`

It reads no files, starts no processes, makes no network requests and calls no model. It stores your settings, and one entry per session holding that session's token counts and when they last changed. It keeps only the 50 most recently used sessions.
