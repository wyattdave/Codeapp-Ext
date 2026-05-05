# codeapp-cli

`codeapp-cli` is now a lightweight wrapper used by the VS Code extension. It does not ship its own dependency tree.

It forwards a small set of extension-facing commands to the supported external CLIs:

- local `power-apps` from `@microsoft/power-apps-cli` for code app deploy, app listing, data sources, and flow commands
- `pac` only for authentication and environment selection

## Commands

```text
codeapp add-data-source  -> power-apps add-data-source
codeapp push             -> power-apps push
codeapp list-codeapps    -> power-apps list-codeapps
codeapp logout           -> pac auth clear
codeapp list-flows       -> power-apps list-flows --non-interactive
codeapp add-flow         -> power-apps add-flow --non-interactive
```

Run locally with:

```powershell
node ./bin/codeapp.js --help
```

The wrapper first looks in the workspace `node_modules/.bin` so the extension can use the installed `@microsoft/power-apps-cli` binary without requiring it on the system `PATH`.
