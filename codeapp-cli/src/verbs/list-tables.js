import { listTablesAsync } from '@microsoft/power-apps-actions';
import { bootstrap } from '../settings.js';

export async function listTablesVerb(opts) {
  const ctx = await bootstrap({ region: opts.cloud, environmentId: opts.environmentId });
  const tables = await listTablesAsync({
    actionsParams: {
      apiId: opts.apiId,
      connectionId: opts.connectionId,
      dataset: opts.dataset,
    },
    logger: ctx.logger,
  });
  if (opts.json) console.log(JSON.stringify(tables, null, 2));
  else for (const t of tables || []) console.log(`${t.Name}\t${t.DisplayName || ''}`);
}
