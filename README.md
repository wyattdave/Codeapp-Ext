# CodeAppJS Extension

CodeAppJS Extension is a VS Code wrapper around Power Platform CLI workflows for code-first apps. The extension no longer hosts an agent panel or chat harness. It now exposes PAC-driven setup, authentication, environment switching, data source sync, debugger toggling, and deploy actions directly in the editor chrome.

This extension is built on [codeapp.js](https://codeappjs.com), which is aimed at developers building Power Apps with HTML, CSS, and JavaScript in a code-first workflow.

## What You Get

- A lightweight Activity Bar view with title-bar actions for setup, Dataverse schema, flow schema, debugger, and deploy.
- Status bar items for Power Platform authentication and environment switching.
- Project setup that copies starter files into your workspace and updates `power.config.json` through native VS Code input prompts.
- Connection reference syncing against the active environment.
- One-click deploy through the packaged `codeapp-js-cli` Power Apps runner, including app URL detection and `appId` update when available.

## Requirements

- VS Code `1.95.0` or newer.
- An open workspace folder.

The extension runs its Power Platform commands through the packaged `codeapp-js-cli` dependency. The extension uses CAP authentication and environment APIs plus the Power Apps runner bundled with `codeapp-js-cli`, so no separate PAC installation or local wrapper is required.

## Quick Start

1. Open the folder that will contain your Power Platform code-first app.
2. Click the `Auth` status bar item to start CAP authentication through the bundled CLI.
3. Click the environment status bar item to select the target environment.
4. Open the `CodeAppJS` Activity Bar view.
5. Use the view title actions for `Setup Project`, `Add Data Sources`, `Toggle Debugger`, and `Deploy`.

## Command Surface

| Command | What it does |
| --- | --- |
| `CodeAppJS: Setup Project` | Copies the bundled template files into the workspace and updates `power.config.json`. |
| `CodeAppJS: Authenticate` | Starts CAP authentication through the bundled `codeapp-js-cli` so you can sign in to Power Platform. |
| `CodeAppJS: Change Environment` | Lists environments, switches the active org selection, stores the selection locally, and updates `power.config.json` when possible. |
| `CodeAppJS: Add Data Sources` | Reads `connectionReferences` from `power.config.json`, inspects available PAC connections, and updates reference details. |
| `CodeAppJS: Add Dataverse Schema` | Prompts for a Dataverse table logical name and generates the matching schema into the agent folder. |
| `CodeAppJS: Add Flow Schema` | Lists flows through the packaged `codeapp-js-cli` Power Apps runner, lets you filter them with Quick Pick search, and adds the selected flow schema in non-interactive mode. |
| `CodeAppJS: Toggle Debugger` | Adds or removes the codeapp debugger snippet from the current build entry point. |
| `CodeAppJS: Deploy` | Runs the packaged Power Apps push command through `codeapp-js-cli`, reports progress, and stores the detected `appId` in `power.config.json` when available. |

## Setup Behavior

When you run project setup, the extension copies files from its bundled template folder into your workspace.

- Existing files are not overwritten.
- If `power.config.json` is copied, the extension asks for app metadata and environment information with native input boxes.
- If the configured build entry point exists, the HTML `<title>` is updated to match the app display name.

## Notes

- PAC authentication must be completed before environment listing, data source sync, or deploy can succeed.
- The extension does not use a system-installed PAC CLI or the old local wrapper; auth, environment, flow, schema, and deploy command execution is backed by the packaged `codeapp-js-cli` dependency.
- Flow commands still run in non-interactive mode so they fail instead of opening a browser prompt when required configuration is missing.
- Deploy captures command output, looks for the Power Apps URL, and stores the detected `appId` in `power.config.json` when possible.
- Data source sync reads `connectionReferences`, selects the configured environment if one is set, inspects available connections, and updates reference metadata in `power.config.json`.

## Version
- v1.1.2 - launch version using CodeApps-JS v1.1.2
- v2.0.0 - update to CodeApps-JS v2.0.0. Removed PowerPlatform CLI dependency and migrated to power-apps-cli npm version to allow deploying apps that call flows.