# codeapp-cli wrappers

The `codeapp-cli` folder now contains only lightweight wrapper scripts used by the extension.

There is no local `npm install` step and no bundled dependency tree.

## Wrapper mapping

| `codeapp` command | Underlying command |
|---|---|
| `codeapp add-data-source --api-id dataverse --resource-name account` | `power-apps add-data-source --api-id dataverse --resource-name account` |
| `codeapp push` | `power-apps push` |
| `codeapp list-codeapps` | `power-apps list-codeapps` |
| `codeapp pac auth who` | Wrapper-managed PAC-compatible auth profile lookup |
| `codeapp logout` | Wrapper-managed PAC-compatible auth clear |
| `codeapp list-flows` | `power-apps list-flows --non-interactive` |
| `codeapp add-flow --flow-id <guid>` | `power-apps add-flow --flow-id <guid> --non-interactive` |

Run the wrapper with:

```powershell
node ./bin/codeapp.js --help
```

The extension UI routes PAC authentication and environment commands through the wrapper's PAC-compatibility layer, backed by the same local `@microsoft/power-apps-cli` install.
