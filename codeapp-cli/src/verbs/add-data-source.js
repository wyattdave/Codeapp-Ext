import { addDataSourceAsync } from '@microsoft/power-apps-actions';
import { bootstrap } from '../settings.js';

export async function addDataSourceVerb(opts) {
  if (!opts.apiId) {
    throw new Error('--api-id is required.');
  }

  const ctx = await bootstrap({ region: opts.cloud, environmentId: opts.environmentId });

  await addDataSourceAsync({
    vfs: ctx.vfs,
    authProvider: ctx.auth,
    region: ctx.region,
    environmentName: ctx.environmentId,
    actionsParams: {
      apiId: opts.apiId,
      connectionId: opts.connectionId,
      tableName: opts.resourceName,
      dataset: opts.dataset,
      sqlStoredProcedure: opts.sqlStoredProcedure,
      envUrl: opts.orgUrl,
      solutionId: opts.solutionId,
      connectionRef: opts.connectionRef,
      skipCodeGen: !!opts.skipCodegen,
    },
    localFilePaths: ctx.fileConfig,
    logger: ctx.logger,
  });

  if (opts.json) {
    console.log(JSON.stringify({ ok: true, apiId: opts.apiId }, null, 2));
  } else {
    console.log('Data source added successfully.');
    console.log("Hint: Run 'codeapp run' to test locally, or 'codeapp push' to deploy.");
  }
}
