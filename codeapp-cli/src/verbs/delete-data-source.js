import { deleteDataSourceAsync } from '@microsoft/power-apps-actions';
import { bootstrap } from '../settings.js';

export async function deleteDataSourceVerb(opts) {
  if (!opts.apiId) throw new Error('--api-id is required.');
  if (!opts.dataSourceName && !opts.sqlStoredProcedure) {
    throw new Error('--data-source-name or --sql-stored-procedure is required.');
  }

  const ctx = await bootstrap({ region: opts.cloud, environmentId: opts.environmentId });

  const removed = await deleteDataSourceAsync({
    vfs: ctx.vfs,
    region: ctx.region,
    environmentName: ctx.environmentId,
    actionsParams: {
      apiId: opts.apiId,
      dataSourceName: opts.dataSourceName,
      sqlStoredProcedure: opts.sqlStoredProcedure,
    },
    localFilePaths: ctx.fileConfig,
    logger: ctx.logger,
  });

  if (opts.json) {
    console.log(JSON.stringify({ ok: true, removed }, null, 2));
  } else {
    console.log(removed ? 'Data source removed.' : 'Data source not found - nothing to remove.');
  }
}
