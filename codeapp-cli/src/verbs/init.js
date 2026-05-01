import path from 'node:path';
import fs from 'node:fs';
import { writeRepoConfig, getEnvironmentByName, VERSION } from '@microsoft/power-apps-actions';
import { bootstrap } from '../settings.js';

export async function initVerb(opts) {
  const cwd = process.cwd();
  const powerConfigPath = path.join(cwd, 'power.config.json');
  if (fs.existsSync(powerConfigPath)) {
    throw new Error(
      'power.config.json already exists in this directory. Use a new directory or delete the existing config.'
    );
  }
  if (!opts.environmentId) {
    throw new Error('--environment-id is required for init.');
  }
  if (!opts.displayName) {
    throw new Error('--display-name is required for init.');
  }

  const ctx = await bootstrap({ cwd, region: opts.cloud, environmentId: opts.environmentId });

  // Validate the environment exists
  let envOk = false;
  try {
    const env = await getEnvironmentByName(opts.environmentId);
    envOk = !!env?.properties;
  } catch {
    envOk = false;
  }
  if (!envOk) {
    throw new Error(
      `Environment '${opts.environmentId}' not found or you do not have access to it.`
    );
  }

  const appConfig = {
    version: VERSION,
    appId: null,
    appDisplayName: opts.displayName,
    region: ctx.region,
    environmentId: opts.environmentId,
    description: opts.description || '',
    buildPath: opts.buildPath || './dist',
    buildEntryPoint: opts.fileEntryPoint || 'index.html',
    localAppUrl: opts.appUrl || 'http://localhost:3000',
    logoPath: opts.logoPath || 'Default',
    connectionReferences: {},
    databaseReferences: {},
  };

  await writeRepoConfig(ctx.fileConfig.powerConfigPath, appConfig);
  printJsonOr(opts, { ok: true, powerConfigPath: ctx.fileConfig.powerConfigPath, appConfig }, () => {
    console.log(`Created power.config.json for ${opts.displayName}.`);
    console.log("Hint: Run 'codeapp add-data-source' to wire data, or 'codeapp run' to start locally.");
  });
}

function printJsonOr(opts, json, text) {
  if (opts.json) console.log(JSON.stringify(json, null, 2));
  else text();
}
