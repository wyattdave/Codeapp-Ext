import { getCodeAppsAsync } from '@microsoft/power-apps-actions';
import { bootstrap } from '../settings.js';

export async function listCodeAppsVerb(opts) {
  await bootstrap({ region: opts.cloud, environmentId: opts.environmentId });
  const apps = await getCodeAppsAsync();
  if (opts.json) {
    console.log(JSON.stringify(apps, null, 2));
  } else if (!apps.length) {
    console.log('No Code Apps found in this environment.');
  } else {
    for (const a of apps) {
      console.log(`${a.name}\t${a.properties?.displayName || ''}`);
    }
  }
}
