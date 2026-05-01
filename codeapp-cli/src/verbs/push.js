import { pushApp, getPlayerServiceConfig } from '@microsoft/power-apps-actions';
import { bootstrap, requireAppConfig, requireEnvironmentId } from '../settings.js';

export async function pushVerb(opts) {
  const ctx = await bootstrap({ region: opts.cloud, environmentId: opts.environmentId });
  const appConfig = requireAppConfig(ctx);
  requireEnvironmentId(ctx);

  const result = await pushApp({
    vfs: ctx.vfs,
    actionsParams: {
      solutionId: opts.solutionId,
      appName: appConfig.appId,
    },
    environmentName: ctx.environmentId,
    region: ctx.region,
    authProvider: ctx.auth,
    localFilePaths: ctx.fileConfig,
    logger: ctx.logger,
    httpClient: getPlayerServiceConfig().httpClient,
  });

  if (opts.json) {
    console.log(JSON.stringify({ ok: true, app: result }, null, 2));
  } else {
    const playUrl = result?.properties?.appPlayUri;
    console.log(`App pushed successfully.${playUrl ? ` Play URL: ${playUrl}` : ''}`);
  }
}
