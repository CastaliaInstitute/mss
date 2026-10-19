const fs = require('fs');
const path = require('path');

const icsPath = path.join(__dirname, '..', 'dist', 'MSS.ics');
let content = fs.readFileSync(icsPath, 'utf8');

// Hindu lunisolar festival dates are location-sensitive. MSS pins the Hindu
// observances in this feed to Drik Panchang's Ujjain, Madhya Pradesh calendar
// (Asia/Kolkata), rather than inferring a Gregorian RRULE. Ujjain is a
// traditional reference meridian for Indian calendrical astronomy, and Drik
// Panchang explicitly computes its festival calendar for the selected city.
const HINDU_SOURCE = 'https://www.drikpanchang.com/calendars/hindu/hinducalendar.html?geoname-id=1253914';
const HINDU_LOCATION = 'Ujjain India (Asia/Kolkata)';
const HINDU_POLICY = 'Drik Panchang location-based Hindu festival dates for Ujjain India';

const NAVARATRI_STARTS = [
  '20261011', '20270930', '20280919', '20291008', '20300928',
  '20311017', '20321005', '20330924', '20341013', '20351002',
];

const DUSSEHRA_DATES = [
  '20261020', '20271009', '20280927', '20291016', '20301006',
  '20311025', '20321014', '20331003', '20341022', '20351011',
];

const GITA_JAYANTI_DATES = [
  '20261220', '20271209', '20281127', '20291216', '20301205',
  '20311224', '20321212', '20331202', '20341221', '20351211',
];

const DIWALI_DATES = [
  '20261108', '20271029', '20281017', '20291105', '20301026', '20311114', '20321102', '20331022', '20341110', '20351030',
];
const HOLI_DATES = [
  '20260304', '20270322', '20280311', '20290301', '20300320', '20310309', '20320327', '20330316', '20340305', '20350324',
];

const NAVARATRI_EVENTS = [
  ['Navaratri Day 1 — Shailaputri', 'shailaputri', 0],
  ['Navaratri Day 2 — Brahmacharini', 'brahmacharini', 1],
  ['Navaratri Day 3 — Chandraghanta', 'chandraghanta', 2],
  ['Navaratri Day 4 — Kushmanda', 'kushmanda', 3],
  ['Navaratri Day 5 — Skandamata', 'skandamata', 4],
  ['Navaratri Day 6 — Katyayani', 'katyayani', 5],
  ['Navaratri Day 7 — Kalaratri', 'kalaratri', 6],
  ['Navaratri Day 8 — Mahagauri', 'mahagauri', 7],
  ['Navaratri Day 9 — Siddhidatri', 'siddhidatri', 8],
];

function unfold(text) {
  return text.replace(/\r?\n[ \t]/g, '');
}

function prop(block, name) {
  const match = unfold(block).match(new RegExp(`^${name}(?:;[^:]*)?:(.*)$`, 'mi'));
  return match ? match[1].trim() : null;
}

function addDays(yyyymmdd, days) {
  const year = Number(yyyymmdd.slice(0, 4));
  const month = Number(yyyymmdd.slice(4, 6));
  const day = Number(yyyymmdd.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}`;
}

function applyDates(block, dates, uid) {
  let updated = block
    .replace(/^UID:.*$/mi, `UID:${uid}`)
    .replace(/^DTSTART(?:;[^:]*)?:.*$/mi, `DTSTART;VALUE=DATE:${dates[0]}`)
    .replace(/^DTEND(?:;[^:]*)?:.*$/mi, `DTEND;VALUE=DATE:${addDays(dates[0], 1)}`)
    .replace(/^RRULE:.*\r?\n/gmi, '')
    .replace(/^RDATE(?:;[^:]*)?:.*\r?\n/gmi, '')
    .replace(/^X-MSS-DATE-SOURCE:.*\r?\n/gmi, '')
    .replace(/^X-MSS-HINDU-LOCATION:.*\r?\n/gmi, '')
    .replace(/^X-MSS-HINDU-POLICY:.*\r?\n/gmi, '');

  if (!/^UID:/mi.test(updated)) {
    updated = updated.replace(/^BEGIN:VEVENT\r?\n/m, `BEGIN:VEVENT\nUID:${uid}\n`);
  }

  const rdates = dates.slice(1).map((date) => `RDATE;VALUE=DATE:${date}`).join('\n');
  updated = updated.replace(
    /^(DTSTART;VALUE=DATE:[^\r\n]+\r?\n)/mi,
    `$1${rdates}\nX-MSS-DATE-SOURCE:${HINDU_SOURCE}\nX-MSS-HINDU-LOCATION:${HINDU_LOCATION}\nX-MSS-HINDU-POLICY:${HINDU_POLICY}\n`,
  );
  return updated;
}

const navaratriBySummary = new Map(NAVARATRI_EVENTS.map(([summary, slug, offset]) => [summary, { slug, offset }]));
const eventRegex = /BEGIN:VEVENT[\s\S]*?END:VEVENT\r?\n?/g;
const changed = new Map();

content = content.replace(eventRegex, (block) => {
  const summary = prop(block, 'SUMMARY');
  if (navaratriBySummary.has(summary)) {
    const { slug, offset } = navaratriBySummary.get(summary);
    const dates = NAVARATRI_STARTS.map((start) => addDays(start, offset));
    changed.set(summary, (changed.get(summary) || 0) + 1);
    return applyDates(block, dates, `navaratri-${slug}@maybesomethingseasonal.com`);
  }

  if (summary === 'Dussehra / Vijayadashami') {
    changed.set(summary, (changed.get(summary) || 0) + 1);
    return applyDates(block, DUSSEHRA_DATES, 'dussehra-vijayadashami@maybesomethingseasonal.com');
  }

  if (summary === 'Diwali (Deepavali)' || summary === 'Holi (Festival of Colors)') {
    const isDiwali = summary === 'Diwali (Deepavali)';
    changed.set(summary, (changed.get(summary) || 0) + 1);
    return applyDates(block, isDiwali ? DIWALI_DATES : HOLI_DATES,
      `${isDiwali ? 'diwali-deepavali' : 'holi'}@maybesomethingseasonal.com`);
  }

  if (summary === 'Gita Jayanti (गीता जयंती)') {
    changed.set(summary, (changed.get(summary) || 0) + 1);
    return applyDates(block, GITA_JAYANTI_DATES, 'gita-jayanti@maybesomethingseasonal.com');
  }

  return block;
});

const expectedSummaries = [
  'Diwali (Deepavali)',
  'Holi (Festival of Colors)',
  ...NAVARATRI_EVENTS.map(([summary]) => summary),
  'Dussehra / Vijayadashami',
  'Gita Jayanti (गीता जयंती)',
];
for (const summary of expectedSummaries) {
  if (changed.get(summary) !== 1) {
    throw new Error(`Expected exactly one ${summary} VEVENT, updated ${changed.get(summary) || 0}`);
  }
}

fs.writeFileSync(icsPath, content);
console.log('Applied Ujjain Hindu festival dates through 2035.');
