import http from 'node:http';
import fs from 'node:fs';
import { bootstrap, requireAppConfig } from '../settings.js';

// Map region -> Power Apps player host
const PLAY_HOSTS = {
  prod: 'apps.powerapps.com',
  test: 'apps.test.powerapps.com',
  preview: 'apps.preview.powerapps.com',
  gcc: 'apps.gov.powerapps.us',
  gcchigh: 'apps.high.powerapps.us',
  dod: 'apps.appsplatform.us',
  china: 'apps.powerapps.cn',
};

function buildPlayUrl(region, environmentId, appId, localAppUrl, configUrl) {
  const host = PLAY_HOSTS[(region || 'prod').toLowerCase()] || PLAY_HOSTS.prod;
  const params = new URLSearchParams({
    source: 'codeapp-cli',
    'code-app-local-source': localAppUrl,
    'code-app-config-url': configUrl,
  });
  return `https://${host}/play/e/${environmentId}/a/${appId || 'local'}?${params.toString()}`;
}

export async function runVerb(opts) {
  const ctx = await bootstrap({ region: opts.cloud, environmentId: opts.environmentId });
  const appConfig = requireAppConfig(ctx);

  const port = parseInt(opts.port, 10) || 8080;
  const localAppUrl = opts.localAppUrl || appConfig.localAppUrl || 'http://localhost:3000';
  const powerConfigPath = ctx.fileConfig.powerConfigPath;

  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }
    try {
      if (!fs.existsSync(powerConfigPath)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'power.config.json not found' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(fs.readFileSync(powerConfigPath, 'utf8'));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, 'localhost', resolve);
  });

  const configUrl = `http://localhost:${port}`;
  const playUrl = buildPlayUrl(ctx.region, ctx.environmentId, appConfig.appId, localAppUrl, configUrl);

  if (opts.json) {
    console.log(JSON.stringify({ ok: true, configUrl, playUrl, localAppUrl }, null, 2));
  } else {
    console.log(`Serving power.config.json at ${configUrl}`);
    console.log(`Play your app locally at: ${playUrl}`);
    // Best-effort liveness probe of the user's local dev server
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 3000);
      await fetch(localAppUrl, { method: 'HEAD', signal: ctrl.signal });
      clearTimeout(t);
    } catch {
      console.warn(`Warning: local app does not appear to be running at ${localAppUrl}`);
    }
  }

  process.on('SIGINT', () => {
    server.close(() => process.exit(0));
  });
}
