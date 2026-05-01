import { listAllEnvironmentVariablesAsync } from '@microsoft/power-apps-actions';
import { bootstrap } from '../settings.js';

export async function listEnvironmentVariablesVerb(opts) {
  const ctx = await bootstrap({ region: opts.cloud, environmentId: opts.environmentId });
  const vars = await listAllEnvironmentVariablesAsync({
    actionsParams: { envUrl: opts.orgUrl },
    localFilePaths: ctx.fileConfig,
    logger: ctx.logger,
  });
  if (opts.json) console.log(JSON.stringify(vars, null, 2));
  else for (const v of vars || []) console.log(`${v.schemaname || v.name}\t${v.displayname || ''}`);
}
