const fs = require('fs');
const path = require('path');

const icsPath = path.join(__dirname, '..', 'dist', 'MSS.ics');
const content = fs.readFileSync(icsPath, 'utf8');

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
  const date = new Date(Date.UTC(Number(yyyymmdd.slice(0, 4)), Number(yyyymmdd.slice(4, 6)) - 1, Number(yyyymmdd.slice(6, 8))));
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}`;
}
function datesFor(block) {
  const unfolded = unfold(block);
  return [
    prop(block, 'DTSTART'),
    ...[...unfolded.matchAll(/^RDATE;VALUE=DATE:(\d{8})$/gmi)].map((match) => match[1]),
  ];
}
function assertEvent(summary, expected, uid) {
  const matches = blocks.filter((block) => prop(block, 'SUMMARY') === summary);
  if (matches.length !== 1) throw new Error(`${summary}: expected one VEVENT, found ${matches.length}`);
  const block = matches[0];
  if (prop(block, 'UID') !== uid) throw new Error(`${summary}: stable UID missing or changed`);
  if (!/^DTSTART;VALUE=DATE:/mi.test(block) || !/^DTEND;VALUE=DATE:/mi.test(block)) {
    throw new Error(`${summary}: expected true all-day VALUE=DATE encoding`);
  }
  if (/^RRULE:/mi.test(block)) throw new Error(`${summary}: Hindu lunisolar observance must not use Gregorian RRULE`);
  const actual = datesFor(block);
  if (actual.join(',') !== expected.join(',')) {
    throw new Error(`${summary}: dates differ\nexpected ${expected.join(',')}\nactual   ${actual.join(',')}`);
  }
  if (prop(block, 'X-MSS-DATE-SOURCE') !== 'https://www.drikpanchang.com/calendars/hindu/hinducalendar.html?geoname-id=1253914') {
    throw new Error(`${summary}: Drik Panchang Ujjain source metadata missing`);
  }
  if (prop(block, 'X-MSS-HINDU-LOCATION') !== 'Ujjain India (Asia/Kolkata)') {
    throw new Error(`${summary}: Ujjain location policy metadata missing`);
  }
  if (!(prop(block, 'X-MSS-HINDU-POLICY') || '').includes('location-based Hindu festival dates')) {
    throw new Error(`${summary}: Hindu calendar policy metadata missing`);
  }
}

const blocks = [...content.matchAll(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g)].map((match) => match[0]);
for (const [summary, slug, offset] of NAVARATRI_EVENTS) {
  assertEvent(summary, NAVARATRI_STARTS.map((date) => addDays(date, offset)), `navaratri-${slug}@maybesomethingseasonal.com`);
}
assertEvent('Dussehra / Vijayadashami', DUSSEHRA_DATES, 'dussehra-vijayadashami@maybesomethingseasonal.com');
assertEvent('Gita Jayanti (गीता जयंती)', GITA_JAYANTI_DATES, 'gita-jayanti@maybesomethingseasonal.com');

assertEvent('Diwali (Deepavali)', DIWALI_DATES, 'diwali-deepavali@maybesomethingseasonal.com');
assertEvent('Holi (Festival of Colors)', HOLI_DATES, 'holi@maybesomethingseasonal.com');

console.log('Authoritative Ujjain Hindu festival date validation passed through 2035.');
