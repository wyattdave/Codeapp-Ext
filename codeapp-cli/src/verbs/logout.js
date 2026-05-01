import { clearTokenCache, tokenCachePath } from '../auth.js';

export async function logoutVerb(opts) {
  await clearTokenCache();
  if (opts.json) {
    console.log(JSON.stringify({ ok: true, cleared: tokenCachePath }, null, 2));
  } else {
    console.log(`Cleared cached tokens at ${tokenCachePath}`);
  }
}
