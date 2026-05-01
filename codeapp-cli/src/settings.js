import path from 'node:path';
import fs from 'node:fs';
import { DeviceCodeAuthenticationProvider } from './auth.js';
import { CodeAppHttpClient } from './http.js';
import { NodeVfs } from './vfs.js';
import { ConsoleLogger } from './logger.js';
import {
  initializePlayerServices,
  setVfs,
  readRepoConfig,
} from '@microsoft/power-apps-actions';

// Standard local file layout for a Code App project.
export function getFileConfig(cwd = process.cwd()) {
  return {
    powerConfigPath: path.join(cwd, 'power.config.json'),
    schemaPath: path.join(cwd, '.power', 'schemas'),
    codeGenPath: path.join(cwd, 'src'),
  };
}

export async function loadAppConfig(powerConfigPath) {
  if (!fs.existsSync(powerConfigPath)) return null;
  // We can't use readRepoConfig until VFS is set, so do a direct read here.
  const raw = await fs.promises.readFile(powerConfigPath, 'utf-8');
  return JSON.parse(raw);
}

// Bootstraps the actions package: VFS, auth, http client, services, logger.
// Returns the shared context every verb needs.
export async function bootstrap({ cwd = process.cwd(), region: regionOverride, environmentId: envIdOverride, verbose = false } = {}) {
  const fileConfig = getFileConfig(cwd);
  const appConfig = await loadAppConfig(fileConfig.powerConfigPath);

  const region = regionOverride || appConfig?.region || 'prod';
  const environmentId = envIdOverride || appConfig?.environmentId;

  const vfs = new NodeVfs(cwd);
  setVfs(vfs);

  const auth = new DeviceCodeAuthenticationProvider();
  await auth.initAsync(region);

  const httpClient = new CodeAppHttpClient(auth);
  const logger = new ConsoleLogger({ verbose });

  initializePlayerServices({
    logger,
    httpClient,
    region,
    environmentName: environmentId,
  });

  return {
    cwd,
    fileConfig,
    appConfig,
    region,
    environmentId,
    vfs,
    auth,
    httpClient,
    logger,
    readRepoConfig,
  };
}

export function requireAppConfig(ctx) {
  if (!ctx.appConfig) {
    throw new Error(
      'power.config.json not found in the current directory. Run `codeapp init` first or cd into your app folder.'
    );
  }
  return ctx.appConfig;
}

export function requireEnvironmentId(ctx) {
  if (!ctx.environmentId) {
    throw new Error(
      'environmentId is required. Set it in power.config.json or pass --environment-id.'
    );
  }
  return ctx.environmentId;
}
