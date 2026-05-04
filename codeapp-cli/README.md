# codeapp-cli

`codeapp-cli` is now a lightweight wrapper used by the VS Code extension. It does not ship its own dependency tree.

It forwards a small set of extension-facing commands to the supported external CLIs:

- `pac` for authentication, Dataverse schema generation, app listing, and deploy
- `npx --package @microsoft/power-apps-cli power-apps --non-interactive` for flow commands

## Commands

```text
codeapp add-data-source  -> pac code add-data-source
codeapp push             -> pac code push
codeapp list-codeapps    -> pac code list
codeapp logout           -> pac auth clear
codeapp list-flows       -> npx --package @microsoft/power-apps-cli power-apps list-flows --non-interactive
codeapp add-flow         -> npx --package @microsoft/power-apps-cli power-apps add-flow --non-interactive
```

Run locally with:

```powershell
node ./bin/codeapp.js --help
```

The wrapper exists so the extension can keep one stable Node entrypoint without bundling `node_modules`.
