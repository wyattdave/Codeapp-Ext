import { listFlowsAsync } from '@microsoft/power-apps-actions';
import { bootstrap, requireEnvironmentId } from '../settings.js';

export async function listFlowsVerb(opts) {
  const ctx = await bootstrap({ region: opts.cloud, environmentId: opts.environmentId });
  requireEnvironmentId(ctx);

  const flows = await listFlowsAsync({
    environmentName: ctx.environmentId,
    actionsParams: { search: opts.search },
    logger: ctx.logger,
  });

  if (opts.json) {
    console.log(JSON.stringify(flows, null, 2));
  } else if (!flows.length) {
    console.log('No flows found.');
  } else {
    for (const f of flows) {
      console.log(`${f.workflowId}\t${f.name}\tstate=${f.statecode}`);
    }
  }
}
