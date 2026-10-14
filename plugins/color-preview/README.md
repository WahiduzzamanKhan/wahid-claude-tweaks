# color-preview

A Claude Code [mod](https://code.claude.com/docs/en/plugins/mods/overview) that paints each colour code in Claude's replies with the colour it names.

When a reply mentions `#c7910c`, `rgb(0 168 132)`, `hsl(270, 50%, 40%)` or `tomato`, the code itself is drawn as a chip with its own colour behind it. The text on the chip is black or white, whichever reads better, so you can see the colour without leaving the terminal.

## What it recognises

| Format | Examples | Notes |
| :- | :- | :- |
| Hex | `#c7910c`, `#00a88480` | Six- and eight-digit forms only. Three- and four-digit forms are left alone, so issue numbers like `#123` stay plain. |
| RGB / RGBA | `rgb(199, 145, 12)`, `rgba(0 168 132 / 50%)` | Commas or spaces, channels as 0–255 or percentages, optional alpha. |
| HSL / HSLA | `hsl(270, 50%, 40%)`, `hsla(0deg 100% 50% / .3)` | Hue as a plain number (degrees) or with `deg`, `turn`, `rad` or `grad`, optional alpha. |
| CSS names | `rebeccapurple`, `tomato`, `RebeccaPurple` | All CSS Color Module Level 4 names, case-insensitive, as whole words only (`red` matches, `reduce` doesn't). |

Alpha is ignored: the chip shows the colour itself, not how it would blend over a background the mod can't know. A function that can't be read as a colour, such as `rgb(foo)`, stays plain. The check is lenient: each value is read up to its first non-numeric character, so a typo like `rgb(12px, 0, 0)` is still chipped.

Because names match anywhere in a reply, everyday words that are also colour names, such as *red*, *gold*, *orange*, *tan* or *snow*, get chips in ordinary sentences too. If that gets in the way, press `4` in `/color-preview` to switch names off.

## How it draws

- **In place**: the chip replaces the code's own text at the same width, so tables and aligned columns stay aligned.
- **Inside other plugins' replies**: a plugin that draws replies itself, such as a skin, gets a `Text` element from color-preview that chips colour codes as it draws. It works whichever of the two plugins runs first.
- **Fallback row**: when the reply is drawn by something the mod can't reach into, such as Claude Code's own markdown, the colours appear as a row of chips under the reply instead. Each code shows once, as first written; repeats are matched ignoring case and spaces, but two different codes for the same colour, such as `#c7910c` and `rgb(199, 145, 12)`, each get a chip.

## Settings

Run `/color-preview` to open the settings pane, then press **1**–**4** to switch a format on or off:

| Key | Format |
| :- | :- |
| `1` | Hex |
| `2` | RGB / RGBA |
| `3` | HSL / HSLA |
| `4` | CSS names |

Every format is on by default. Your choices are saved to the mod's store, so they apply to every new session on this machine and come back after `/clear`. A session that is already open keeps the choices it loaded until you restart it or run `/clear`. Replies already on screen repaint as soon as you toggle a format. Esc closes the pane.

## Requirements

- Claude Code **v2.1.287** or later in the terminal, or a Desktop app whose Code tab runs v2.1.286 or later. Tested with **Claude Code 2.1.287**. Mod events and methods can change between releases, so if something stops working after an update, check that version first.
- Chips are drawn in the terminal and in the Code tab of the Desktop app. In the VS Code extension's chat panel, `claude -p`, the Agent SDK and cloud sessions, the mod loads but draws nothing. See [Where mods run](https://code.claude.com/docs/en/plugins/mods/overview#where-mods-run).

## Install

From the [wahid-claude-tweaks](../../README.md) marketplace:

```bash
claude plugin marketplace add WahiduzzamanKhan/wahid-claude-tweaks
claude plugin install color-preview@wahid-claude-tweaks
```

Get later versions with `claude plugin update color-preview@wahid-claude-tweaks`. If you install or update it while a session is open, run `/reload-plugins` in that session. To check that it loaded, run `/plugin`: the line under the tabs should list `color-preview`.

To try it without installing, load the directory for one session from a clone of the repository:

```bash
claude --plugin-dir plugins/color-preview
```

## What it can access

A mod runs with your permissions, so here is everything this one does, as reported by `claude plugin validate`:

- **Hooks**: `session.start`, `classic.SessionStart`, `command.run` for `/color-preview`, `ui.render` for its settings pane and for `AssistantMessage`, and `ui.resolve` for `AssistantMessage`, to hand other plugins a `Text` that chips colour codes
- **Calls**: `$.command.register`, `$.state.get`/`set`, `$.store.get`/`set`, `$.ui.invalidate`, `$.ui.open`, `$.ui.resolve`

It reads no files, starts no processes, makes no network requests and calls no model. The only thing it stores is the `formats` key, which holds your on/off choices.

## Project layout

The plugin lives at `plugins/color-preview/` in the marketplace repository.

```text
color-preview/
├── .claude-plugin/
│   └── plugin.json            # Manifest: name, version, author, types
├── hooks/
│   ├── hooks.json             # Points Claude Code at register.tsx
│   ├── register.tsx           # Hooks: settings pane, /color-preview, painting replies
│   └── colors.ts              # Format patterns, CSS names, conversion to #rrggbb, text contrast
├── tests/
│   └── color-preview.test.tsx # Tests run by `claude plugin test`
├── types/
│   └── index.d.ts             # Declares the mod's $.state value (Formats)
├── LICENSE                    # MIT
└── README.md
```

## Development

Work against the directory with `--plugin-dir` rather than an installed copy: Claude Code reloads the hooks module each time you save, so changes show up in the running session. Claude Code caches installed plugins by version, so edits don't reach an installed copy until you bump `version` in `plugin.json` and install again.

```bash
# Check the manifest, hooks and declared types
claude plugin validate --strict .   # from plugins/color-preview

# Run the tests
claude plugin test .
```

The tests for chips, the fallback row and the settings pane draw both the terminal and Desktop versions. Together the tests cover painting in place, text contrast, `#123` staying plain, the fallback row, every format, invalid functions staying plain, the settings pane saving a toggle, every format switched off, and saved choices coming back after `/clear`.
