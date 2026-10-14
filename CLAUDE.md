# wahid-claude-tweaks

A Claude Code plugin marketplace. The repository root is the marketplace root.

- `.claude-plugin/marketplace.json` lists every plugin. `metadata.pluginRoot` is `./plugins`, so each entry's `source` is the bare directory name.
- Each plugin lives in `plugins/<name>/` and is self-contained: its own `.claude-plugin/plugin.json`, `README.md`, `LICENSE` and tests. Users get a copy of that directory only, so nothing in a plugin may reference files outside it.
- The entry `name` in `marketplace.json` must equal `name` in the plugin's `plugin.json`. Never rename a published plugin or the marketplace.
- New plugins: create `plugins/<name>/` with a `plugin.json` (`name`, `version`, `description`, `author`, `"license": "MIT"`), its components, tests for a mod, a `README.md` and a copy of the root `LICENSE`. Add an entry `{ "name": "<name>", "source": "<name>", "description": "..." }` to `marketplace.json` and a row to the Plugins table in `README.md`. Try it with `claude --plugin-dir plugins/<name>`.
- Any change to a plugin that users should receive bumps `version` in its `plugin.json`.
- Before finishing any change, run `claude plugin validate --strict .` at the root, and `claude plugin validate --strict .` plus `claude plugin test` in each changed plugin. All must pass.
- Mod tests go in `tests/<name>.test.ts(x)` inside the plugin. Type-check a mod with `npx -y -p typescript tsc -p . --noEmit` from its directory after loading it once with `--plugin-dir`, which writes its `tsconfig.json` (gitignored).
- Each plugin README keeps a **What it can access** section that matches the `hooks:` and `calls:` lines of `claude plugin validate`.
