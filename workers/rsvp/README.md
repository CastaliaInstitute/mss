# MSS RSVP → private CalDAV + notifications

Cloudflare Worker for the MSS calendar. It accepts a guest response, verifies the
published event occurrence and Turnstile proof, and durably queues it. A Durable
Object writes an all-day, transparent, PRIVATE attendance record into
`https://cal.castalia.institute/custodian/mss-rsvps/`, then emails
`custodian@castalia.institute` via Resend and/or posts to a configured private
Matrix room. No attendee information enters the public MSS feed.

This stores attendance records in Radicale. It does **not** implement CalDAV
scheduling, send native invitations, book third-party tickets, or assert an
all-day holiday is the time of a hosted party. Respondent addresses are
self-reported, as with a normal public RSVP form.

## Provisioning

1. Connect Cloudflare access: account ID and API token permitted to deploy Workers,
   SQLite Durable Objects, custom domains/routes, and relevant zone resources for
   `castalia.institute`. The config uses `rsvp.castalia.institute`; deploying
   creates a billable Worker/Durable Object workload under the account plan.
2. Create a dedicated Radicale service account `mss-rsvp` through the server's
   supported account-management flow. Give it access only to the private RSVP
   collection. Put these rules **before** broad owner/default rules in Radicale's
   rights file (administrators can retain their existing access):

   ```ini
   [mss-rsvp-calendar]
   user = mss-rsvp
   collection = custodian/mss-rsvps(/.*)?
   permissions = rRwW

   [mss-rsvp-no-other-calendars]
   user = mss-rsvp
   collection = .*
   permissions =
   ```

   The Worker creates the collection on its first delivery if missing. Verify
   anonymously that collection/item reads fail with 401/403, and verify that the
   service account cannot access another calendar. Do not share the custodian's
   administrator password. Radicale filesystem access controls, rather than the
   ICS CLASS property alone, enforce privacy.
3. Create a production Turnstile widget restricted to `mss.castalia.institute`.
   The Worker verifies hostname and action `rsvp`. Keep its secret server-side;
   its site key is public. The public endpoint also requires the exact site
   Origin and applies Cloudflare's per-IP limit (5/minute per edge location).
4. Configure notifications: a Resend key and a verified-domain sender, or Matrix
   homeserver URL, bot token, and a private **unencrypted** room the bot has
   already joined. Direct Matrix sends here do not implement E2EE. Both channels
   can be configured. A partial channel configuration makes readiness fail.
5. Add repository Actions secrets:
   `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `RSVP_CALDAV_PASSWORD`,
   `RSVP_RECORD_SECRET` (a stable random secret of at least 32 characters),
   `RSVP_TURNSTILE_SECRET_KEY`, and `RSVP_RESEND_API_KEY` and/or
   `RSVP_MATRIX_ACCESS_TOKEN`. Add variables `RSVP_EMAIL_FROM` and/or
   `RSVP_MATRIX_HOMESERVER`, `RSVP_MATRIX_ROOM_ID`.
   Never commit these values or put them in VITE variables. For direct CLI use,
   bind the corresponding unprefixed names used by `scripts/upload-secrets.mjs`
   through the environment. Local `.dev.vars` is gitignored.
6. Run the **RSVP Worker** GitHub workflow manually on main. It tests, uploads
   runtime secrets, and deploys. A first secret upload may create a fail-closed
   Worker placeholder before deployment. Pushes run tests only. Missing settings
   fail explicitly. This workflow does not change the site's live RSVP mode.

## Activation and verification

`GET /health` reports configuration readiness only; it does not prove credentials
work or that a notification was delivered. After deployment:

1. Confirm CalDAV account scoping and collection privacy as above.
2. Use a local/staging calendar with endpoint config and the real Turnstile site
   key. Complete one clearly labelled RSVP test from the allowed hostname.
3. Confirm the private record in the custodian calendar and receipt at
   `custodian@castalia.institute` or the configured Matrix room. Confirm updating
   the same attendee/occurrence changes the same resource and sends an update.
4. From this directory run `node scripts/activate.mjs PUBLIC_TURNSTILE_SITE_KEY`.
   This checks readiness and prepares `public/rsvp.json`. Review and publish that
   change through the normal MSS Pages deployment, then repeat the real flow.

Keep email-draft mode until these checks succeed. A static config change cannot
provision credentials or a backend.

## Delivery and recovery

A 202 `{ "ok": true }` means the RSVP is durably received, not that an email is
in an inbox. Calendar/notification delivery runs through Durable Object alarms,
with exponential backoff up to daily retries. CalDAV delivery must succeed
before notifications. Each completed stage is checkpointed, so notification
failure does not repeatedly rewrite the calendar. Identical submissions are
coalesced; a newer response replaces a pending older response for the same
attendee and occurrence. This supports correction of a response, not an audit
history of every intermediate click.

Resource names use an HMAC of event UID, occurrence date, and normalized email;
they expose no raw attendee address. Keep RECORD_SECRET stable: changing it
changes record identities. Matrix transaction IDs and Resend idempotency keys
reduce duplicate sends; Resend's idempotency window is finite, so an ambiguous
network failure retried outside that window may duplicate an email.

Queued personal data is deleted from Durable Object state after all configured
channels succeed; deduplication metadata remains. Failed deliveries retain their
payload for retry until resolved or explicitly deleted by an administrator.
Private CalDAV records and received messages follow the host's retention policy.
The Worker exposes no public attendance-list/read endpoint and logs no payloads.
Check the Durable Object's `record` state (`attempts`, `lastFailure`, delivery
flags) if notifications stall. After fixing credentials or connectivity, alarms
resume delivery. Do not delete pending records without accounting for received
RSVPs. For rollback, restore public/rsvp.json to email mode; keep the Worker and
Durable Objects running until pending deliveries are resolved.

## Tests

`npm ci && npm test && npm run check` validates server input, real calendar
occurrences, ICS escaping/UTF-8 folding, private records, bot checks, rate limits,
durable acceptance, replay handling, and delivery recovery using mocked services.
No production messages are sent by these tests. `npm run check` bundles for the
Workers runtime without deploying.
