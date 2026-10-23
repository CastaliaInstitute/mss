import {spawnSync} from 'node:child_process';
// Supply via CI/environment bindings. Never print secret values.
const names = ['CALDAV_PASSWORD', 'RECORD_SECRET', 'TURNSTILE_SECRET_KEY', 'RESEND_API_KEY', 'EMAIL_FROM', 'MATRIX_HOMESERVER', 'MATRIX_ACCESS_TOKEN', 'MATRIX_ROOM_ID'];
const values = Object.fromEntries(names.filter(name => process.env[name]).map(name => [name, process.env[name]]));
for (const name of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'CALDAV_PASSWORD', 'RECORD_SECRET', 'TURNSTILE_SECRET_KEY']) {
  if (!process.env[name]) throw new Error(`Missing deployment setting: ${name}`);
}
if (process.env.RECORD_SECRET.length < 32) throw new Error('RECORD_SECRET must be at least 32 characters');
if (!(values.RESEND_API_KEY && values.EMAIL_FROM) && !(values.MATRIX_HOMESERVER && values.MATRIX_ACCESS_TOKEN && values.MATRIX_ROOM_ID)) throw new Error('Configure email or Matrix notification settings');
const result = spawnSync('npx', ['--no-install', 'wrangler', 'secret', 'bulk'], {input: JSON.stringify(values), stdio: ['pipe', 'inherit', 'inherit']});
process.exit(result.status ?? 1);
