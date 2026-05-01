# codeapp-cli

A standalone JavaScript CLI for Power Apps Code Apps. It wraps `@microsoft/power-apps-actions` directly instead of going through the official `@microsoft/power-apps-cli` shell, so a custom CLI can ship without requiring users to install the external `npx power-apps` tool.

## What's here

| Layer | File | Purpose |
|---|---|---|
| Entry | [bin/codeapp.js](bin/codeapp.js) | Shebang → `cli.run` |
| Argv  | [src/cli.js](src/cli.js) | Commander definitions for every verb |
| Auth  | [src/auth.js](src/auth.js) | MSAL device-code flow, file-cached at `~/.codeapp-cli/msal_cache.json` |
| HTTP  | [src/http.js](src/http.js) | `fetch` wrapper that satisfies the actions package `IHttpClient` contract |
| VFS   | [src/vfs.js](src/vfs.js) | `node:fs`-backed VFS for `setVfs()` |
| Logger| [src/logger.js](src/logger.js) | No-op logger that satisfies the telemetry contract |
| Wiring| [src/settings.js](src/settings.js) | Loads `power.config.json`, calls `initializePlayerServices` |
| Verbs | [src/verbs/](src/verbs/) | Thin wrappers over `@microsoft/power-apps-actions` exports |

## Verbs

```
codeapp init                          --display-name <n> [--description ...] [--build-path ...]
codeapp push                          [--solution-id <id>]
codeapp run                           [--port 8080] [--local-app-url http://localhost:3000]
codeapp add-data-source               --api-id <id> [--connection-id ...] [--resource-name ...] [--dataset ...]
codeapp delete-data-source            --api-id <id> --data-source-name <n>
codeapp add-flow                      --flow-id <guid>
codeapp remove-flow                   --flow-name <name>
codeapp list-flows                    [--search <text>]
codeapp list-codeapps
codeapp list-tables                   --api-id <id> --connection-id <id> --dataset <id>
codeapp list-datasets                 --api-id <id> --connection-id <id>
codeapp list-connection-references    [--solution-id ...] [--org-url ...]
codeapp list-environment-variables    [--org-url ...]
codeapp logout
```

Global flags: `--environment-id`, `--cloud`, `--json`, `--no-color`.

## Authentication

First call to any networked verb triggers MSAL device-code login:

```
To sign in, use a web browser to open https://microsoft.com/devicelogin
and enter the code XXXXXX to authenticate.
```

Token is cached in `~/.codeapp-cli/msal_cache.json` (plain JSON, no OS encryption layer). Use `codeapp logout` to clear it.

The CLI uses the same first-party Power Apps client ID as the official CLI (`9cee029c-6210-4654-90bb-17e6e9d36617`) so consent surfaces are identical.

## Why this layering

- **`@microsoft/power-apps-actions` is kept as a dependency.** It contains the connector code generation (`ts-morph` + Dataverse CSDL parsing + swagger → typed wrapper). Re-implementing it would be weeks and risk breaking generated assets.
- **`@microsoft/power-apps-cli` is dropped.** It was just argv parsing + prompts + a switch over actions calls — easy to replace and gives us full UX control.

## Embedding in another CLI

Every verb is a plain async function. Import them directly:

```js
import { pushVerb } from 'codeapp-cli/src/verbs/push.js';
await pushVerb({ cloud: 'prod', solutionId: 'my-solution' });
```

Or call the actions package directly via the same bootstrap:

```js
import { bootstrap } from 'codeapp-cli/src/settings.js';
import { getCodeAppsAsync } from '@microsoft/power-apps-actions';

const ctx = await bootstrap();
const apps = await getCodeAppsAsync();
```
