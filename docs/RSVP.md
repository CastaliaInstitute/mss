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

## CalDAV scheduling

The published MSS subscription is a read-only holiday feed. It is not a scheduling inbox and cannot process `ATTENDEE` replies. CalDAV RSVP support needs a scheduling-capable calendar server and organizer account, not merely an ICS download.

A future scheduling endpoint can accept the same form payload. It must map the selected event UID and occurrence date to the organizer's hosted gathering, create/manage an invitation with `ORGANIZER` and `ATTENDEE`/`RSVP=TRUE`, and process calendar scheduling responses (`PARTSTAT=ACCEPTED`, `TENTATIVE`, or `DECLINED`). Changing an attendee property in an arbitrary CalDAV resource is not a substitute for the server's scheduling workflow. Calendar account URLs, scheduling privileges, notification behavior, and authentication must be verified with the selected provider.

Do not put attendee addresses into the public holiday subscription. Keep private invitations and attendance records in the organizer's private calendar. Per-event scheduling also requires actual gathering start/end times; the holiday's all-day occurrence should not be silently presented as a confirmed party time.

No CalDAV server has been configured for this feature yet.

## Verification

Run `npm run test:rsvp` with Playwright Chromium installed. Tests mock the calendar and delivery endpoint; they do not send email. For an existing system Chromium, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its executable path. The tests cover draft contents, exact event dates and UID forwarding, pending-submit protection, explicit retry after failure, declining with zero guests, invalid input, event allow-lists, and insecure endpoint rejection.
