# CodeAppJS Extension

CodeAppJS Extension is a VS Code wrapper around Power Platform CLI workflows for code-first apps. The extension no longer hosts its own agent panel or chat harness. It now exposes PAC-driven setup, authentication, environment switching, data source sync, debugger toggling, and deploy actions directly in the editor chrome, and it contributes a packaged `codeapp` custom agent plus related skills to Copilot Chat.

This extension is built on [codeapp.js](https://codeappjs.com), which is aimed at developers building Power Apps with HTML, CSS, and JavaScript in a code-first workflow.

## What You Get

- Top editor buttons for `Debugger` and `Deploy`.
- Bottom status bar actions for `Deploy`, `Debugger`, `Dataverse`, `Table`, `Env Var`, `Flow`, `Mockup`, `Import`, `Setup`, `Env`, and `Auth`.
- A packaged `codeapp` custom agent in the Copilot Chat agent picker, backed by the bundled `codeapp-js` agent and skill files.
- Extension commands backed by the bundled `codeapp-js-cli`, without changing terminal `PATH`.
- Project setup that copies starter files into your workspace and updates `power.config.json` through native VS Code input prompts.
- Connection reference syncing against the active environment.
- Code app import that lists available code apps in the selected environment, exports the chosen solution, and unpacks it into the workspace.
- Mockup launching that lists HTML mockups in `agent/` and opens the selected file in your default browser.
- One-click deploy through the packaged `codeapp-js-cli` Power Apps runner, including app URL detection and `appId` update when available.
- A `Ctrl+Alt+D` keybinding for `CodeAppJS: Deploy`.

## Requirements

- VS Code `1.95.0` or newer.
- An open workspace folder.

The extension runs its Power Platform commands through the packaged `codeapp-js-cli` dependency. The extension uses CAP authentication and environment APIs plus the Power Apps runner bundled with `codeapp-js-cli`, so no separate PAC installation or local wrapper is required for extension commands.

The extension does not add its bundled CLI to terminal `PATH`. To use `CAP` directly in a terminal, install `codeapp-js-cli` separately.

## Quick Start

1. Open the folder that will contain your Power Platform code-first app.
2. Click the `Auth` status bar item to start CAP authentication through the bundled CLI.
3. Click the environment status bar item to select the target environment.
4. Use the bottom status bar actions for `Setup`, `Dataverse`, `Table`, `Env Var`, `Flow`, `Mockup`, and `Import` as needed.
5. Use the top editor buttons for `Debugger` and `Deploy`.

## Command Surface

| Command | What it does |
| --- | --- |
| `CodeAppJS: Setup Project` | Copies the bundled template files into the workspace and updates `power.config.json`. |
| `CodeAppJS: Import Code App` | Lists code apps in the selected environment, exports the selected solution, and unpacks it into the workspace. |
| `CodeAppJS: Authenticate` | Starts CAP authentication through the bundled `codeapp-js-cli` so you can sign in to Power Platform. |
| `CodeAppJS: Change Authentication Account` | Runs `CAP auth --change` to clear cached authentication and show the account picker. |
| `CodeAppJS: Log Out` | Runs `CAP auth --logout` to clear the cached Power Platform login. |
| `CodeAppJS: Change Environment` | Lists environments, switches the active org selection, stores the selection locally, and updates `power.config.json` when possible. |
| `CodeAppJS: Add Dataverse Schema` | Prompts for a Dataverse table logical name and generates the matching schema into the agent folder. |
| `CodeAppJS: Add Dataverse Table` | Uses VS Code input prompts to collect table metadata and optional fields, then creates the Dataverse table through `cap table`. |
| `CodeAppJS: Add Environment Variable` | Collects a name, publisher prefix, and JSON value, then runs `CAP environment-variable`. |
| `CodeAppJS: Add Flow Schema` | Lists flows through the packaged `codeapp-js-cli` Power Apps runner, lets you filter them with Quick Pick search, and adds the selected flow schema in non-interactive mode. |
| `CodeAppJS: Add Flow Schema by ID` | Prompts for a flow ID and runs `CAP flow --<flow-id>` directly. |
| `CodeAppJS: Skills` | Lists the skills bundled with `codeapp-js` and opens the selected skill file. |
| `CodeAppJS: Open Mockup` | Lists HTML mockups under `agent/` and opens the selected mockup in the default browser. |
| `CodeAppJS: Toggle Debugger` | Adds or removes the codeapp debugger snippet from the current build entry point. |
| `CodeAppJS: Deploy` | Runs the packaged Power Apps push command through `codeapp-js-cli`, reports progress, and stores the detected `appId` in `power.config.json` when available. |

## Setup Behavior

When you run project setup, the bundled `codeapp-js-cli` copies the `codeApp/` template from the bundled `codeapp-js` npm package into your workspace. Agents, skills (including their supporting files), and starter app files all come from that same package; the extension has no separate resources copy.

- Existing files are not overwritten.
- If `power.config.json` is copied, the extension asks for app metadata and environment information with native input boxes.
- If the configured build entry point exists, the HTML `<title>` is updated to match the app display name.

## Notes

- PAC authentication must be completed before environment listing, data source sync, or deploy can succeed.
- The extension does not use a system-installed PAC CLI or the old local wrapper; auth, environment, flow, schema, and deploy command execution is backed by the packaged `codeapp-js-cli` dependency.
- Flow commands still run in non-interactive mode so they fail instead of opening a browser prompt when required configuration is missing.
- Import uses a VS Code Quick Pick to choose a code app before running the packaged `cap export` workflow non-interactively.
- Mockup uses a VS Code Quick Pick to choose an HTML file from `agent/` before running the packaged `cap mockup` workflow.
- Deploy captures command output, looks for the Power Apps URL, and stores the detected `appId` in `power.config.json` when possible.
- Data source sync reads `connectionReferences`, selects the configured environment if one is set, inspects available connections, and updates reference metadata in `power.config.json`.

## Packaging a Release

1. Install dependencies with `npm ci`.
2. Set the extension release version in `package.json`.
3. Run `npm run package` (or `npm run package:win32-x64`).

The VSCE prepublish lifecycle installs `codeapp-js@latest`, records the exact resolved version in the manifest and lockfile, then discovers and registers all agent and skill files from its `AI/` directory. A dependency override keeps `codeapp-js-cli` on the same SDK version. Missing agents, skills, or essential template files fail the build instead of silently producing an incomplete extension. Commit the updated manifest and lockfile with the release.

Packaging requires npm registry access; a failed refresh stops the release rather than falling back to stale assets. Do not disable npm lifecycle scripts or skip the prepublish hook. Direct `vsce package` and `vsce publish` also run this refresh; specify `--target win32-x64` when using VSCE directly.

“Latest” means the npm `latest` release at packaging time. Installed extensions use those bundled assets without downloading executable updates at activation. Publish and install a new extension release to distribute newer SDK assets, then reload VS Code and start a fresh chat to use the updated agent.

Development scripts, tests, SDK examples, and redundant template ZIP archives are excluded from the VSIX. The SDK's full `AI/` and unpacked `codeApp/` assets are retained, including skill supporting documents that would otherwise match generic documentation exclusions.

## Version
- v2.1.6 - removed unused resources; refresh codeapp-js to latest on each release, automatically register its agents and skills, and keep setup templates on the same SDK version.
- v1.1.2 - launch version using CodeApps-JS v1.1.2
- v2.0.0 - update to CodeApps-JS v2.0.0. Removed PowerPlatform CLI dependency and migrated to power-apps-cli npm version to allow deploying apps that call flows.
- v2.1.2 - added environment-variable, auth account change/logout, direct flow ID, and skills commands; stopped exposing the bundled CAP executable in terminals.