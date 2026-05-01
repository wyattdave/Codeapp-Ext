import { Command, Option } from 'commander';
import { initVerb } from './verbs/init.js';
import { pushVerb } from './verbs/push.js';
import { runVerb } from './verbs/run.js';
import { addDataSourceVerb } from './verbs/add-data-source.js';
import { deleteDataSourceVerb } from './verbs/delete-data-source.js';
import { addFlowVerb } from './verbs/add-flow.js';
import { listFlowsVerb } from './verbs/list-flows.js';
import { removeFlowVerb } from './verbs/remove-flow.js';
import { listCodeAppsVerb } from './verbs/list-codeapps.js';
import { listTablesVerb } from './verbs/list-tables.js';
import { listDatasetsVerb } from './verbs/list-datasets.js';
import { listConnectionReferencesVerb } from './verbs/list-connection-references.js';
import { listEnvironmentVariablesVerb } from './verbs/list-environment-variables.js';
import { logoutVerb } from './verbs/logout.js';

export async function run(argv) {
  const program = new Command();
  program
    .name('codeapp')
    .description(
      'Standalone JavaScript CLI for Power Apps Code Apps. Provides init, push, run, data-source, and flow management without requiring @microsoft/power-apps-cli to be installed.'
    )
    .version('0.1.0');

  // Global options that mirror the official CLI surface
  program
    .option('-e, --environment-id <id>', 'Environment ID to connect to (overrides power.config.json)')
    .option('--cloud <cloud>', 'Cloud instance to use (e.g. prod, gcc, gccHigh, dod)', 'prod')
    .option('--json', 'Format output as JSON')
    .option('--no-color', 'Disable colored output');

  // ---- init -----------------------------------------------------------
  program
    .command('init')
    .description('Initialize a new Power Apps Code App in the current directory.')
    .option('-n, --display-name <name>', 'Display name for the app')
    .option('-d, --description <desc>', 'App description', '')
    .option('-b, --build-path <path>', 'Build output path', './dist')
    .option('-f, --file-entry-point <file>', 'Entry point file', 'index.html')
    .option('-a, --app-url <url>', 'Local URL where the app is hosted', 'http://localhost:3000')
    .option('-l, --logo-path <path>', 'Path to the app logo file', 'Default')
    .action(async (opts, cmd) => {
      await initVerb({ ...cmd.optsWithGlobals(), ...opts });
    });

  // ---- push -----------------------------------------------------------
  program
    .command('push')
    .description('Package the build output and push the Code App to the environment.')
    .option('-s, --solution-id <id>', 'Solution name or ID to add the app to')
    .action(async (opts, cmd) => {
      await pushVerb({ ...cmd.optsWithGlobals(), ...opts });
    });

  // ---- run ------------------------------------------------------------
  program
    .command('run')
    .description('Serve power.config.json locally so the Power Apps host can connect to your dev app.')
    .option('-p, --port <port>', 'Port to serve power.config.json on', '8080')
    .option('-l, --local-app-url <url>', 'Local URL where your built app is hosted')
    .action(async (opts, cmd) => {
      await runVerb({ ...cmd.optsWithGlobals(), ...opts });
    });

  // ---- add-data-source -----------------------------------------------
  program
    .command('add-data-source')
    .description('Add a Dataverse table or connector data source to the current app.')
    .option('-a, --api-id <id>', 'API identifier (e.g. "dataverse" or "shared_sharepointonline")')
    .option('-c, --connection-id <id>', 'Connection identifier (for connector data sources)')
    .option('--connection-ref <name>', 'Connection reference logical name (Dataverse-resolved)')
    .option('-t, --resource-name <name>', 'Table or resource name')
    .option('-d, --dataset <id>', 'Dataset identifier (for tabular connectors)')
    .option('-u, --org-url <url>', 'Dataverse organization URL')
    .option('--sql-stored-procedure <name>', 'SQL stored procedure name')
    .option('-s, --solution-id <id>', 'Solution identifier')
    .option('--skip-codegen', 'Skip TypeScript model/service generation')
    .action(async (opts, cmd) => {
      await addDataSourceVerb({ ...cmd.optsWithGlobals(), ...opts });
    });

  // ---- delete-data-source --------------------------------------------
  program
    .command('delete-data-source')
    .description('Remove a data source from the current app.')
    .option('-a, --api-id <id>', 'API identifier associated with the data source')
    .option('-n, --data-source-name <name>', 'Data source or table name to remove')
    .option('--sql-stored-procedure <name>', 'SQL stored procedure name to remove')
    .action(async (opts, cmd) => {
      await deleteDataSourceVerb({ ...cmd.optsWithGlobals(), ...opts });
    });

  // ---- add-flow -------------------------------------------------------
  program
    .command('add-flow')
    .description('Add a Power Automate cloud flow as a data source. Generates schema + typed wrapper.')
    .requiredOption('-i, --flow-id <id>', 'Cloud flow ID (workflow GUID)')
    .action(async (opts, cmd) => {
      await addFlowVerb({ ...cmd.optsWithGlobals(), ...opts });
    });

  // ---- remove-flow ----------------------------------------------------
  program
    .command('remove-flow')
    .description('Remove a previously added cloud flow from the app.')
    .requiredOption('-n, --flow-name <name>', 'Display name (or sanitized name) of the flow to remove')
    .action(async (opts, cmd) => {
      await removeFlowVerb({ ...cmd.optsWithGlobals(), ...opts });
    });

  // ---- list-flows -----------------------------------------------------
  program
    .command('list-flows')
    .description('List cloud flows in the environment Dataverse.')
    .option('--search <text>', 'Optional search text to filter flow names')
    .action(async (opts, cmd) => {
      await listFlowsVerb({ ...cmd.optsWithGlobals(), ...opts });
    });

  // ---- list-codeapps --------------------------------------------------
  program
    .command('list-codeapps')
    .description('List all Code Apps in the environment.')
    .action(async (opts, cmd) => {
      await listCodeAppsVerb({ ...cmd.optsWithGlobals(), ...opts });
    });

  // ---- list-tables ----------------------------------------------------
  program
    .command('list-tables')
    .description('List tables for a connector dataset.')
    .requiredOption('-a, --api-id <id>', 'API identifier')
    .requiredOption('-c, --connection-id <id>', 'Connection identifier')
    .requiredOption('-d, --dataset <id>', 'Dataset identifier')
    .action(async (opts, cmd) => {
      await listTablesVerb({ ...cmd.optsWithGlobals(), ...opts });
    });

  // ---- list-datasets --------------------------------------------------
  program
    .command('list-datasets')
    .description('List datasets for a connection.')
    .requiredOption('-a, --api-id <id>', 'API identifier')
    .requiredOption('-c, --connection-id <id>', 'Connection identifier')
    .action(async (opts, cmd) => {
      await listDatasetsVerb({ ...cmd.optsWithGlobals(), ...opts });
    });

  // ---- list-connection-references ------------------------------------
  program
    .command('list-connection-references')
    .description('List connection references in the environment.')
    .option('-s, --solution-id <id>', 'Solution identifier filter')
    .option('-u, --org-url <url>', 'Dataverse organization URL')
    .action(async (opts, cmd) => {
      await listConnectionReferencesVerb({ ...cmd.optsWithGlobals(), ...opts });
    });

  // ---- list-environment-variables ------------------------------------
  program
    .command('list-environment-variables')
    .description('List environment variables in the environment.')
    .option('-u, --org-url <url>', 'Dataverse organization URL')
    .action(async (opts, cmd) => {
      await listEnvironmentVariablesVerb({ ...cmd.optsWithGlobals(), ...opts });
    });

  // ---- logout ---------------------------------------------------------
  program
    .command('logout')
    .description('Clear cached MSAL tokens for codeapp-cli.')
    .action(async (opts, cmd) => {
      await logoutVerb({ ...cmd.optsWithGlobals(), ...opts });
    });

  await program.parseAsync(argv);
}
