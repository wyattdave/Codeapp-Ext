import { removeFlowAsync } from '@microsoft/power-apps-actions';
import { bootstrap } from '../settings.js';

export async function removeFlowVerb(opts) {
  const ctx = await bootstrap({ region: opts.cloud, environmentId: opts.environmentId });

  const result = await removeFlowAsync({
    vfs: ctx.vfs,
    authProvider: ctx.auth,
    region: ctx.region,
    environmentName: ctx.environmentId,
    actionsParams: { flowDataSourceName: opts.flowName },
    localFilePaths: ctx.fileConfig,
    logger: ctx.logger,
  });

  if (!result.success) {
    throw new Error(`Failed to remove flow: ${result.error || 'unknown error'}`);
  }
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (!result.found) {
    console.log(`Flow '${opts.flowName}' was not found in the current app.`);
  } else {
    console.log(`Flow '${opts.flowName}' removed.`);
  }
}
