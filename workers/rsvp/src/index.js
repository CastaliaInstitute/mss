import {calendarRecord, digest, validateInput, verifyOccurrence} from './calendar.js';

const json = (body, status = 200, headers = {}) => Response.json(body, {status, headers: {'Cache-Control': 'no-store', ...headers}});
const https = value => { try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && !u.search && !u.hash; } catch { return false; } };
export function ready(env) {
  const notify = (env.RESEND_API_KEY && env.EMAIL_FROM) || (https(env.MATRIX_HOMESERVER) && env.MATRIX_ACCESS_TOKEN && env.MATRIX_ROOM_ID);
  if ((env.RESEND_API_KEY || env.EMAIL_FROM) && !(env.RESEND_API_KEY && env.EMAIL_FROM)) return false;
  if ((env.MATRIX_ACCESS_TOKEN || env.MATRIX_HOMESERVER || env.MATRIX_ROOM_ID) && !(https(env.MATRIX_HOMESERVER) && env.MATRIX_ACCESS_TOKEN && env.MATRIX_ROOM_ID)) return false;
  return !!(https(env.ALLOWED_ORIGIN) && https(env.FEED_URL) && env.RECIPIENT === 'custodian@castalia.institute' && https(env.CALDAV_COLLECTION_URL) && env.CALDAV_COLLECTION_URL.endsWith('/') && env.CALDAV_USER && env.CALDAV_PASSWORD && env.RECORD_SECRET?.length >= 32 && env.TURNSTILE_SECRET_KEY && notify && env.RSVPS && env.RATE_LIMITER);
}
async function remote(url, options = {}) {
  return fetch(url, {...options, redirect: 'error', signal: AbortSignal.timeout(8000)});
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    const origin = request.headers.get('Origin');
    const cors = {'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN, 'Vary': 'Origin', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type'};
    if (path === '/health' && request.method === 'GET') return json({ready: ready(env)}, ready(env) ? 200 : 503);
    if (path !== '/rsvp') return json({ok: false}, 404);
    if (origin !== env.ALLOWED_ORIGIN) return json({ok: false}, 403);
    if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers: cors});
    if (request.method !== 'POST') return json({ok: false}, 405, cors);
    if (!ready(env)) return json({ok: false, error: 'unavailable'}, 503, cors);
    try {
      const ip = request.headers.get('CF-Connecting-IP');
      if (!ip || !(await env.RATE_LIMITER.limit({key: ip})).success) return json({ok: false}, 429, cors);
      if (!request.headers.get('Content-Type')?.startsWith('application/json')) return json({ok: false}, 415, cors);
      const reader = request.body?.getReader();
      if (!reader) return json({ok: false}, 400, cors);
      let length = 0; const chunks = [];
      for (;;) {
        const {done, value} = await reader.read(); if (done) break;
        length += value.length;
        if (length > 12000) { await reader.cancel(); return json({ok: false}, 413, cors); }
        chunks.push(value);
      }
      const bytes = new Uint8Array(length); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      let body, data;
      try { body = JSON.parse(new TextDecoder().decode(bytes)); if (!body || typeof body !== 'object' || body._gotcha) throw new Error(); data = validateInput(body); }
      catch { return json({ok: false}, 400, cors); }
      if (typeof body.turnstileToken !== 'string' || body.turnstileToken.length > 2048) return json({ok: false}, 400, cors);
      const challenge = await remote('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({secret: env.TURNSTILE_SECRET_KEY, response: body.turnstileToken, remoteip: ip}),
      });
      const proof = await challenge.json();
      if (!challenge.ok || !proof.success || proof.hostname !== new URL(env.ALLOWED_ORIGIN).hostname || proof.action !== 'rsvp') return json({ok: false}, 403, cors);
      // Fetch only the configured public calendar; ignore client-supplied URLs/subjects.
      const feed = await remote(env.FEED_URL, {cf: {cacheTtl: 300, cacheEverything: true}});
      if (!feed.ok) return json({ok: false}, 503, cors);
      if (!verifyOccurrence(await feed.text(), data)) return json({ok: false, error: 'unknown_event'}, 400, cors);
      const id = await digest(env.RECORD_SECRET, JSON.stringify([data.event_uid, data.date, data.email]));
      const record = env.RSVPS.get(env.RSVPS.idFromName(id));
      const receipt = await record.fetch(new Request('https://private/submit', {method: 'POST', body: JSON.stringify({data, id})}));
      return json(await receipt.json(), receipt.status, cors);
    } catch {
      // Never log request bodies, upstream credentials, or attendee information.
      return json({ok: false, error: 'unavailable'}, 503, cors);
    }
  },
};

export class RsvpRecord {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }
  async fetch(request) {
    return this.ctx.blockConcurrencyWhile(async () => {
      const {data, id} = await request.json();
      const fingerprint = await digest(this.env.RECORD_SECRET, JSON.stringify(data));
      const previous = await this.ctx.storage.get('record');
      if (previous?.fingerprint === fingerprint) return json({ok: true}, 202);
      const record = {data, id, fingerprint, version: (previous?.version ?? -1) + 1, attempts: 0, calendar: false, email: false, matrix: false};
      await this.ctx.storage.transaction(async tx => { await tx.put('record', record); await tx.setAlarm(Date.now() + 1000); });
      // Acknowledgement means durably queued, not delivered to an inbox.
      return json({ok: true}, 202);
    });
  }
  async alarm() {
    return this.ctx.blockConcurrencyWhile(async () => {
      const record = await this.ctx.storage.get('record');
      if (!record?.data) return;
      try {
        await this.deliver(record);
        // Keep only deduplication metadata after delivery; PII remains in private CalDAV.
        delete record.data;
        delete record.lastFailure;
        await this.ctx.storage.put('record', record);
      } catch {
        record.attempts++;
        record.lastFailure = new Date().toISOString();
        await this.ctx.storage.put('record', record);
        await this.ctx.storage.setAlarm(Date.now() + Math.min(86400000, 30000 * 2 ** Math.min(record.attempts, 12)));
        console.error('RSVP delivery pending; retry scheduled');
      }
    });
  }
  async deliver(record) {
    const env = this.env;
    const auth = 'Basic ' + btoa(String.fromCharCode(...new TextEncoder().encode(`${env.CALDAV_USER}:${env.CALDAV_PASSWORD}`)));
    const headers = {Authorization: auth};
    if (!record.calendar) {
      const collection = await remote(env.CALDAV_COLLECTION_URL, {method: 'PROPFIND', headers: {...headers, Depth: '0'}});
      if (collection.status === 404) {
        const created = await remote(env.CALDAV_COLLECTION_URL, {method: 'MKCALENDAR', headers: {...headers, 'Content-Type': 'application/xml'}, body: '<?xml version="1.0"?><C:mkcalendar xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav"><D:set><D:prop><D:displayname>MSS RSVPs (Private)</D:displayname></D:prop></D:set></C:mkcalendar>'});
        if (![201, 405].includes(created.status)) throw new Error('calendar_create');
      } else if (!collection.ok) throw new Error('calendar_discover');
      const saved = await remote(`${env.CALDAV_COLLECTION_URL}${record.id}.ics`, {method: 'PUT', headers: {...headers, 'Content-Type': 'text/calendar; charset=utf-8'}, body: calendarRecord(record.data, record.id, record.version)});
      if (!saved.ok) throw new Error('calendar_save');
      record.calendar = true; await this.ctx.storage.put('record', record);
    }
    const d = record.data;
    const text = `RSVP: ${d.event}\nDate: ${d.date}\n${d.name} <${d.email}>\nResponse: ${d.response}\nParty size: ${d.guests}\n\n${d.note}`;
    if (env.RESEND_API_KEY && !record.email) {
      const sent = await remote('https://api.resend.com/emails', {method: 'POST', headers: {Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `${record.id}-${record.version}`}, body: JSON.stringify({from: env.EMAIL_FROM, to: [env.RECIPIENT], reply_to: d.email, subject: `RSVP: ${d.event} — ${d.date}`.replace(/[\r\n]/g, ' '), text})});
      const receipt = await sent.json();
      if (!sent.ok || !receipt.id) throw new Error('email_send');
      record.email = true; await this.ctx.storage.put('record', record);
    }
    if (env.MATRIX_ACCESS_TOKEN && !record.matrix) {
      const base = env.MATRIX_HOMESERVER.replace(/\/$/, '');
      const room = encodeURIComponent(env.MATRIX_ROOM_ID);
      const sent = await remote(`${base}/_matrix/client/v3/rooms/${room}/send/m.room.message/${record.id}-${record.version}`, {method: 'PUT', headers: {Authorization: `Bearer ${env.MATRIX_ACCESS_TOKEN}`, 'Content-Type': 'application/json'}, body: JSON.stringify({msgtype: 'm.text', body: text})});
      const receipt = await sent.json();
      if (!sent.ok || !receipt.event_id) throw new Error('matrix_send');
      record.matrix = true; await this.ctx.storage.put('record', record);
    }
  }
}
