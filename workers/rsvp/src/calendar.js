import ICAL from 'ical.js';

export function validateInput(body) {
  const text = (key, max) => {
    if (typeof body[key] !== 'string' || body[key].length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(body[key])) throw new Error('invalid');
    return body[key].trim();
  };
  const data = {
    name: text('name', 100), email: text('email', 254).toLowerCase(),
    event: text('event', 250), event_uid: text('event_uid', 500),
    date: text('date', 10), response: text('response', 20),
    note: text('note', 1000), guests: body.guests,
  };
  if (!data.name || /[\r\n]/.test(data.name) || !/^[^\s@,;<>"\\]+@[^\s@,;<>"\\]+\.[^\s@,;<>"\\]+$/.test(data.email) || !data.event_uid) throw new Error('invalid');
  if (Number(data.date.slice(0, 4)) < 2024 || Number(data.date.slice(0, 4)) > 2100 || !/^\d{4}-\d{2}-\d{2}$/.test(data.date) || !Number.isFinite(Date.parse(data.date)) || new Date(data.date).toISOString().slice(0, 10) !== data.date) throw new Error('invalid');
  if (!['Going', 'Maybe', 'Not going'].includes(data.response) || !Number.isInteger(data.guests) || data.guests < 0 || data.guests > 20 || (data.response !== 'Not going' && data.guests < 1) || (data.response === 'Not going' && data.guests !== 0)) throw new Error('invalid');
  return data;
}

export function verifyOccurrence(feed, data) {
  const calendar = new ICAL.Component(ICAL.parse(feed));
  const component = calendar.getAllSubcomponents('vevent').find(item => item.getFirstPropertyValue('uid') === data.event_uid);
  if (!component || component.getFirstPropertyValue('summary') !== data.event) return false;
  const event = new ICAL.Event(component);
  const day = ICAL.Time.fromDateString(data.date);
  // Compare the event's local civil day, including timed events and RDATEs.
  const excluded = component.getAllProperties('exdate').flatMap(prop => prop.getValues()).some(date => date.toString().slice(0, 10) === data.date);
  if (excluded) return false;
  if (event.startDate.toString().slice(0, 10) === data.date) return true;
  const iterator = event.iterator();
  for (let i = 0; i < 50000; i++) {
    const next = iterator.next();
    if (!next) return false;
    const date = next.toString().slice(0, 10);
    if (date === data.date) return true;
    if (date > day.toString()) return false;
  }
  return false;
}

export async function digest(secret, value) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  const bytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function calendarRecord(data, id, version, now = new Date()) {
  const esc = value => value.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const end = new Date(`${data.date}T00:00:00Z`); end.setUTCDate(end.getUTCDate() + 1);
  const status = {Going: 'ACCEPTED', Maybe: 'TENTATIVE', 'Not going': 'DECLINED'}[data.response];
  const description = `Attendance record for our gathering; not a ticket or calendar invitation.\nName: ${data.name}\nEmail: ${data.email}\nResponse: ${data.response}\nParty size: ${data.guests}\n\n${data.note}`;
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Castalia Institute//MSS RSVP//EN', 'BEGIN:VEVENT',
    `UID:${id}@rsvp.castalia.institute`, `DTSTAMP:${stamp}`, `LAST-MODIFIED:${stamp}`, `SEQUENCE:${version}`,
    `DTSTART;VALUE=DATE:${data.date.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${end.toISOString().slice(0, 10).replace(/-/g, '')}`,
    `SUMMARY:${esc(`RSVP: ${data.event} — ${data.name}`)}`, 'CLASS:PRIVATE', 'TRANSP:TRANSPARENT',
    `RELATED-TO:${esc(data.event_uid)}`, `ATTENDEE;PARTSTAT=${status}:mailto:${data.email}`,
    `X-MSS-PARTY-SIZE:${data.guests}`, `DESCRIPTION:${esc(description)}`, 'END:VEVENT', 'END:VCALENDAR'];
  // RFC 5545 folds at octet boundaries without splitting UTF-8 characters.
  return lines.map(line => {
    const chunks = []; let current = '';
    for (const char of line) {
      if (new TextEncoder().encode(current + char).length > 75) { chunks.push(current); current = ' '; }
      current += char;
    }
    chunks.push(current); return chunks.join('\r\n');
  }).join('\r\n') + '\r\n';
}
