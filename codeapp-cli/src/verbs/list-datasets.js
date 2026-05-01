import { listDatasetsAsync } from '@microsoft/power-apps-actions';
import { bootstrap } from '../settings.js';

export async function listDatasetsVerb(opts) {
  const ctx = await bootstrap({ region: opts.cloud, environmentId: opts.environmentId });
  const datasets = await listDatasetsAsync({
    actionsParams: { apiId: opts.apiId, connectionId: opts.connectionId },
    logger: ctx.logger,
  });
  if (opts.json) console.log(JSON.stringify(datasets, null, 2));
  else for (const d of datasets || []) console.log(`${d.Name || d.name}\t${d.DisplayName || d.displayName || ''}`);
}
