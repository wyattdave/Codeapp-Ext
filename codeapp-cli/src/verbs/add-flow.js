import { addFlowAsync } from '@microsoft/power-apps-actions';
import { bootstrap } from '../settings.js';

export async function addFlowVerb(opts) {
  if (!opts.flowId) throw new Error('--flow-id is required.');

  const ctx = await bootstrap({ region: opts.cloud, environmentId: opts.environmentId });

  const result = await addFlowAsync({
    vfs: ctx.vfs,
    authProvider: ctx.auth,
    region: ctx.region,
    environmentName: ctx.environmentId,
    actionsParams: { flowId: opts.flowId },
    localFilePaths: ctx.fileConfig,
    logger: ctx.logger,
  });

  if (!result.success) {
    throw new Error(`Failed to add flow: ${result.error || 'unknown error'}`);
  }
  if (opts.json) {
    console.log(JSON.stringify({ ok: true, flowId: opts.flowId }, null, 2));
  } else {
    console.log(`Flow ${opts.flowId} added.`);
  }
}
