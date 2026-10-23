import {writeFile} from 'node:fs/promises';
const [siteKey] = process.argv.slice(2);
if (!siteKey || !/^[a-zA-Z0-9_-]{10,100}$/.test(siteKey)) throw new Error('Usage: node scripts/activate.mjs TURNSTILE_PUBLIC_SITE_KEY');
const health = await fetch('https://rsvp.castalia.institute/health', {redirect: 'error'});
if (!health.ok || (await health.json()).ready !== true) throw new Error('Worker is not ready; existing email mode was preserved');
await writeFile(new URL('../../../public/rsvp.json', import.meta.url), JSON.stringify({mode: 'endpoint', recipient: 'custodian@castalia.institute', endpoint: 'https://rsvp.castalia.institute/rsvp', turnstileSiteKey: siteKey}, null, 2) + '\n');
console.log('Prepared public/rsvp.json. Verify CalDAV and notification delivery before publishing it.');
