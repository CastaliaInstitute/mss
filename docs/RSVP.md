# RSVP delivery

The calendar reads `public/rsvp.json`. The initial configuration opens an email RSVP to `custodian@castalia.institute` from each event's details. Guests must send the draft in their own email application; opening it is not a completed RSVP. No attendee data is stored by the static website.

The form includes the event title, occurrence date, UID (when available), guest name and email, Going/Maybe/Not going, party size, and a note. Kiosk and regular calendar views share the same event dialog. A response goes to the calendar host; it does not register a guest with a third-party event organizer.

To limit RSVPs to hosted events, add an `eventTitles` array of exact calendar titles to the configuration. An empty array disables every RSVP button. An absent or invalid configuration hides the form.

## Automatic email

To accept responses directly on the website, provision an email form endpoint (for example, Formspree) for the recipient, then change the configuration:

```json
{
  "mode": "endpoint",
  "recipient": "custodian@castalia.institute",
  "endpoint": "https://formspree.io/f/REPLACE_WITH_FORM_ID"
}
```

The endpoint must allow browser requests from `https://mss.castalia.institute` and accept JSON POSTs with `name`, `email`, `response`, `guests`, `note`, `event`, `date`, `event_uid`, `event_url`, `_subject`, `_replyto`, and `_gotcha`. A successful response must have HTTP 2xx and JSON `{"ok":true}`. Other outcomes show an error, never a success. Submission is disabled while a request is pending. There are no automatic retries.

The endpoint must handle server-side validation, spam protection, rate limits, and delivery. A form endpoint URL is public configuration. SMTP/API passwords and CalDAV credentials must remain on the server, never in `public/`, `src/`, or `VITE_*` variables. Confirm the form recipient with the provider before enabling endpoint mode. Test delivery separately with the recipient; an accepted submission does not establish inbox delivery.

## Private CalDAV attendance records

The Cloudflare Worker in [`workers/rsvp`](../workers/rsvp/README.md) implements
private CalDAV storage and automatic email/Matrix notifications. It verifies
Turnstile proofs and matches the event UID, title, and actual occurrence against
the published calendar before durably accepting an RSVP. It writes to a dedicated
private collection on `cal.castalia.institute`. CalDAV writes and notifications
retry in the background. “Received” means durably queued, not inbox delivery.

This is an attendance-record integration for Radicale, not native invitation/reply
scheduling. Records are private, transparent all-day entries with PARTSTAT;
they do not set party start times, book tickets, or publish attendee addresses.

The implementation is prepared but requires Cloudflare deployment access, scoped
CalDAV credentials, production Turnstile settings, and email/Matrix credentials.
Follow the Worker README to deploy and verify actual delivery before switching
`public/rsvp.json`. The live site remains in email-draft mode until activation.
The protected endpoint configuration adds a public `turnstileSiteKey` field.

## Verification

Run `npm run test:rsvp` with Playwright Chromium installed. Tests mock the calendar and delivery endpoint; they do not send email. For an existing system Chromium, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its executable path. The tests cover draft contents, exact event dates and UID forwarding, pending-submit protection, explicit retry after failure, declining with zero guests, invalid input, event allow-lists, and insecure endpoint rejection.
