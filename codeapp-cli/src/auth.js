import { PublicClientApplication } from '@azure/msal-node';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Same first-party Power Apps client ID the official CLI uses.
// This is a public client app, no secret involved.
const CLIENT_ID = '9cee029c-6210-4654-90bb-17e6e9d36617';

const CACHE_DIR = path.join(os.homedir(), '.codeapp-cli');
const CACHE_PATH = path.join(CACHE_DIR, 'msal_cache.json');

function getAuthority(region, tenantId) {
  const tenant = tenantId || 'organizations';
  // Sovereign cloud overrides
  switch ((region || 'prod').toLowerCase()) {
    case 'gcc':
    case 'gcchigh':
    case 'usgovhigh':
      return `https://login.microsoftonline.us/${tenant}`;
    case 'dod':
    case 'usgovdod':
      return `https://login.microsoftonline.us/${tenant}`;
    case 'china':
    case 'mooncake':
      return `https://login.partner.microsoftonline.cn/${tenant}`;
    default:
      return `https://login.microsoftonline.com/${tenant}`;
  }
}

class FilePersistenceCachePlugin {
  async beforeCacheAccess(ctx) {
    try {
      if (fs.existsSync(CACHE_PATH)) {
        ctx.tokenCache.deserialize(await fs.promises.readFile(CACHE_PATH, 'utf-8'));
      }
    } catch {
      /* ignore corrupt cache */
    }
  }
  async afterCacheAccess(ctx) {
    if (ctx.cacheHasChanged) {
      await fs.promises.mkdir(CACHE_DIR, { recursive: true });
      await fs.promises.writeFile(CACHE_PATH, ctx.tokenCache.serialize(), 'utf-8');
    }
  }
}

export class DeviceCodeAuthenticationProvider {
  _msal;
  _tenantId;
  _region;

  async initAsync(region) {
    this._region = region || 'prod';
    this._msal = new PublicClientApplication({
      auth: {
        authority: getAuthority(this._region, this._tenantId),
        clientId: CLIENT_ID,
      },
      cache: {
        cachePlugin: new FilePersistenceCachePlugin(),
      },
    });
  }

  getUserTenantId() {
    return this._tenantId;
  }

  async getAccessTokenForResource(resource) {
    if (!this._msal) {
      await this.initAsync(this._region);
    }
    const scope = (resource || '').replace(/\/$/, '') + '/.default';

    // Try silent first
    const accounts = await this._msal.getTokenCache().getAllAccounts();
    if (accounts.length > 0) {
      try {
        const result = await this._msal.acquireTokenSilent({
          account: accounts[0],
          scopes: [scope],
        });
        if (result?.accessToken) {
          this._tenantId = result.tenantId;
          return result.accessToken;
        }
      } catch {
        // fall through to device code
      }
    }

    // Device code flow
    const result = await this._msal.acquireTokenByDeviceCode({
      scopes: [scope],
      deviceCodeCallback: (response) => {
        // eslint-disable-next-line no-console
        console.log('\n' + response.message + '\n');
      },
    });
    if (!result?.accessToken) {
      throw new Error('Failed to acquire access token via device code flow');
    }
    this._tenantId = result.tenantId;
    return result.accessToken;
  }
}

export async function clearTokenCache() {
  try {
    await fs.promises.rm(CACHE_PATH, { force: true });
  } catch {
    /* ignore */
  }
}

export const tokenCachePath = CACHE_PATH;
