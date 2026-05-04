# codeapp-cli wrappers

The `codeapp-cli` folder now contains only lightweight wrapper scripts used by the extension.

There is no local `npm install` step and no bundled dependency tree.

## Wrapper mapping

| `codeapp` command | Underlying command |
|---|---|
| `codeapp add-data-source --api-id dataverse --resource-name account` | `pac code add-data-source --apiId dataverse --table account` |
| `codeapp push` | `pac code push` |
| `codeapp list-codeapps` | `pac code list` |
| `codeapp logout` | `pac auth clear` |
| `codeapp list-flows` | `npx --yes --package @microsoft/power-apps-cli power-apps list-flows --non-interactive` |
| `codeapp add-flow --flow-id <guid>` | `npx --yes --package @microsoft/power-apps-cli power-apps add-flow --flow-id <guid> --non-interactive` |

Run the wrapper with:

```powershell
node ./bin/codeapp.js --help
```

Use PAC directly for authentication and environment selection from the extension UI.
