# Using `codeapp-cli` instead of Power Platform CLI

`codeapp-cli` is a standalone JavaScript CLI for managing Power Apps Code Apps. It removes the need to install Microsoft's Power Platform CLI (`pac`) or the official `@microsoft/power-apps-cli` (`npx power-apps`) tools — every common Code App workflow is implemented natively in this repo.

This guide shows the equivalent `codeapp` command for each workflow you would normally run with `pac` or `npx power-apps`.

## Prerequisites

| Need | `pac` workflow | `codeapp-cli` workflow |
|---|---|---|
| Install | Install Power Platform Tools / `pac` | `npm install` inside [codeapp-cli/](codeapp-cli/) |
| Runtime | .NET runtime + `pac` binary | Node.js ≥ 22 only |
| Sign-in | `pac auth create` | First command triggers MSAL device-code prompt |
| Token cache | `pac` profile store | `~/.codeapp-cli/msal_cache.json` |

No `pac` install. No `npx power-apps` install. No external Microsoft CLI.

## Install

From the repo root:

```powershell
cd codeapp-cli
npm install
```

Run via the local bin:

```powershell
node ./bin/codeapp.js --help
```

Or link it globally so you can call `codeapp` from any folder:

```powershell
cd codeapp-cli
npm link
codeapp --help
```

## Authentication

The first command that hits the network triggers a device-code login:

```
To sign in, use a web browser to open https://microsoft.com/devicelogin
and enter the code XXXXXXXX to authenticate.
```

After successful sign-in, the token is cached to `~/.codeapp-cli/msal_cache.json` and reused silently. To switch accounts:

```powershell
codeapp logout
```

The CLI uses the same first-party Power Apps client ID as Microsoft's official tooling (`9cee029c-6210-4654-90bb-17e6e9d36617`), so the consent screen and permissions are identical.

## Global flags

These work on every command:

| Flag | Description |
|---|---|
| `-e, --environment-id <id>` | Override `environmentId` from `power.config.json` |
| `--cloud <cloud>` | Sovereign cloud (`prod`, `gcc`, `gccHigh`, `dod`, `china`) |
| `--json` | Print machine-readable JSON output |
| `--no-color` | Disable colored output |

## Command reference

### Initialize a new Code App

```powershell
# pac equivalent: pac code init --displayName "My App" --environment <env>
codeapp init --display-name "My App" --environment-id <env-guid>
```

Common options:

| Option | Default | Purpose |
|---|---|---|
| `--display-name` `-n` | required | App display name |
| `--description` `-d` | empty | App description |
| `--build-path` `-b` | `./dist` | Folder pushed to the environment |
| `--file-entry-point` `-f` | `index.html` | App entry HTML |
| `--app-url` `-a` | `http://localhost:3000` | Local dev URL |
| `--logo-path` `-l` | `Default` | App icon |

### Push the app to the environment

```powershell
# pac equivalent: pac code push --solutionName MySolution
codeapp push --solution-id MySolution
```

Packages the configured `buildPath`, uploads to blob storage, creates or updates the app, optionally adds it to a solution, then publishes.

### Run the app locally

```powershell
# pac equivalent: pac code run
codeapp run --port 8080 --local-app-url http://localhost:3000
```

Serves `power.config.json` on `http://localhost:<port>` so the Power Apps host can connect to your dev build, and prints the play URL to open.

### Add a data source

#### Dataverse table

```powershell
# pac equivalent: pac code add-data-source --apiId dataverse --tableName accounts
codeapp add-data-source --api-id dataverse --resource-name accounts
```

#### Connector table (e.g. SharePoint)

```powershell
codeapp add-data-source `
  --api-id shared_sharepointonline `
  --connection-id <connection-guid> `
  --dataset "https://contoso.sharepoint.com/sites/sales" `
  --resource-name "Leads"
```

#### SQL stored procedure

```powershell
codeapp add-data-source `
  --api-id shared_sql `
  --connection-id <connection-guid> `
  --dataset "server.database.windows.net,databaseName" `
  --sql-stored-procedure "dbo.sp_GetCustomers"
```

#### Connector reference (Dataverse-resolved connection)

```powershell
codeapp add-data-source `
  --api-id shared_office365 `
  --connection-ref my_office365_ref `
  --resource-name profile
```

Add `--skip-codegen` to update only `power.config.json` without regenerating the PAC-compatible artifacts under `.power/schemas/` and `src/generated/`.

### Remove a data source

```powershell
# pac equivalent: pac code delete-data-source --apiId dataverse --dataSourceName accounts
codeapp delete-data-source --api-id dataverse --data-source-name accounts
```

For SQL stored procedures:

```powershell
codeapp delete-data-source --api-id shared_sql --sql-stored-procedure dbo.sp_GetCustomers
```

### Add a Power Automate cloud flow

```powershell
# pac equivalent: pac code add-flow --flowId <guid>
codeapp add-flow --flow-id <workflow-guid>
```

This pulls the flow's metadata + swagger, writes schema artifacts under `.power/schemas/`, regenerates the typed flow wrapper under `src/generated/`, and adds the flow's connection references (and any dependent connection references) to `power.config.json`.

Tip: get the workflow GUID with `codeapp list-flows`.

### Remove a cloud flow

```powershell
codeapp remove-flow --flow-name "My Flow Display Name"
```

Removes the schema file, the connection reference, and any unused dependent stub references, then regenerates the model service.

### List cloud flows

```powershell
# pac equivalent: pac code list-flows
codeapp list-flows --search "approval"
```

Prints `workflowId<TAB>name<TAB>state` lines, or full JSON with `--json`.

### List Code Apps in the environment

```powershell
# pac equivalent: pac code list
codeapp list-codeapps
```

### List connector datasets

```powershell
codeapp list-datasets --api-id shared_sharepointonline --connection-id <conn-guid>
```

### List tables in a connector dataset

```powershell
codeapp list-tables `
  --api-id shared_sharepointonline `
  --connection-id <conn-guid> `
  --dataset "https://contoso.sharepoint.com/sites/sales"
```

### List connection references

```powershell
codeapp list-connection-references --solution-id <solution-id>
```

### List environment variables

```powershell
codeapp list-environment-variables
```

### Logout

```powershell
codeapp logout
```

Clears the local MSAL token cache.

## Side-by-side: typical app workflow

| Step | `pac` | `codeapp-cli` |
|---|---|---|
| 1. Sign in | `pac auth create --environment <url>` | _(auto on first command)_ |
| 2. Init project | `pac code init --displayName "App"` | `codeapp init --display-name "App" -e <env>` |
| 3. Add Dataverse table | `pac code add-data-source --apiId dataverse --tableName accounts` | `codeapp add-data-source --api-id dataverse --resource-name accounts` |
| 4. Add a flow | `pac code add-flow --flowId <guid>` | `codeapp add-flow --flow-id <guid>` |
| 5. Run locally | `pac code run` _(plus your dev server)_ | `codeapp run` _(plus your dev server)_ |
| 6. Push | `pac code push --solutionName Mine` | `codeapp push --solution-id Mine` |
| 7. List apps | `pac code list` | `codeapp list-codeapps` |

## When you might still want `pac`

`codeapp-cli` covers Code App development end-to-end. Reach for `pac` if you also need:

- **Solution import/export** (`pac solution import|export`)
- **Plugin / PCF control development** (`pac plugin`, `pac pcf`)
- **Environment lifecycle management** (`pac admin create-environment`, etc.)

These are out of scope for a Code App CLI and not currently planned for `codeapp-cli`.

## Embedding `codeapp-cli` in your own tooling

Each verb is a plain async function that you can import and call directly — no need to spawn the CLI as a subprocess.

```js
import { bootstrap } from 'codeapp-cli/src/settings.js';
import { pushVerb } from 'codeapp-cli/src/verbs/push.js';
import { listFlowsVerb } from 'codeapp-cli/src/verbs/list-flows.js';

await pushVerb({ cloud: 'prod', solutionId: 'MySolution' });
await listFlowsVerb({ json: true });
```

Or skip the verb wrappers and call `@microsoft/power-apps-actions` exports directly through the shared bootstrap:

```js
import { bootstrap } from 'codeapp-cli/src/settings.js';
import { getCodeAppsAsync } from '@microsoft/power-apps-actions';

await bootstrap();
const apps = await getCodeAppsAsync();
```

This is the recommended way to ship a custom CLI for your own organization that includes Code App management without forcing every developer to install Power Platform CLI.
