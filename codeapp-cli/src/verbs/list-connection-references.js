import { listConnectionReferences } from '@microsoft/power-apps-actions';
import { bootstrap } from '../settings.js';

export async function listConnectionReferencesVerb(opts) {
  const ctx = await bootstrap({ region: opts.cloud, environmentId: opts.environmentId });
  const refs = await listConnectionReferences({
    actionsParams: { solutionId: opts.solutionId, envUrl: opts.orgUrl },
    logger: ctx.logger,
  });
  if (opts.json) console.log(JSON.stringify(refs, null, 2));
  else for (const r of refs || []) console.log(`${r.connectionreferencelogicalname || r.name}\t${r.connectorid || ''}`);
}
