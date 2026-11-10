#!/usr/bin/env node

// Create full-screen, six-ink PhotoPainter backgrounds for every MSS event
// occurring in the Winter 2026 book window. Original images remain unchanged.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const DIST_ICS = path.join(ROOT, 'dist', 'MSS.ics');
const PUBLIC = path.join(ROOT, 'public');
const BOOK_ART = path.join(ROOT, 'books', 'winter-2026', 'art', 'events');
const PUBLIC_ART = path.join(PUBLIC, 'mss-daily-art', 'events');
const DIST_ART = path.join(ROOT, 'dist', 'mss-daily-art', 'events');
const MANIFEST_NAME = 'photopainter-event-backgrounds.json';
const MANIFEST_PATH = path.join(PUBLIC_ART, MANIFEST_NAME);
const START = '2026-11-01';
const END = '2027-01-31';
const WIDTH = 800;
const HEIGHT = 480;
const MONTHS = ['', 'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

function unfold(text) { return text.replace(/\r?\n[ \t]/g, ''); }

function readEvents() {
  const text = unfold(fs.readFileSync(DIST_ICS, 'utf8'));
  return text.split('BEGIN:VEVENT').slice(1).map((chunk) => {
    const block = chunk.split('END:VEVENT')[0];
    const event = {};
    for (const line of block.split(/\r?\n/)) {
      const colon = line.indexOf(':');
      if (colon < 0) continue;
      const key = line.slice(0, colon).split(';')[0].toUpperCase();
      if (['UID', 'DTSTART', 'SUMMARY', 'X-IMAGE', 'RRULE', 'RDATE'].includes(key)) {
        if (key === 'RDATE') event.RDATE = [...(event.RDATE || []), line.slice(colon + 1)];
        else event[key] = line.slice(colon + 1);
      }
    }
    return event;
  }).filter((event) => event.UID && event.SUMMARY && event.DTSTART);
}

function dateParts(value) {
  const match = value && value.match(/(\d{4})(\d{2})(\d{2})/);
  return match ? { year: +match[1], month: +match[2], day: +match[3] } : null;
}

function keyFor(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function daysInMonth(year, month) { return new Date(Date.UTC(year, month, 0)).getUTCDate(); }
function weekday(year, month, day) { return ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][new Date(Date.UTC(year, month - 1, day)).getUTCDay()]; }

function occurrenceDates(event) {
  const start = dateParts(event.DTSTART);
  if (!start) return [];
  const result = new Set();
  const add = (year, month, day) => {
    const date = keyFor(year, month, day);
    if (date >= START && date <= END && day >= 1 && day <= daysInMonth(year, month)) result.add(date);
  };
  add(start.year, start.month, start.day);
  for (const values of event.RDATE || []) {
    for (const value of values.split(',')) {
      const date = dateParts(value);
      if (date) add(date.year, date.month, date.day);
    }
  }
  if (!event.RRULE || !/^FREQ=YEARLY(?:;|$)/i.test(event.RRULE)) return [...result];

  const rule = Object.fromEntries(event.RRULE.split(';').map((part) => {
    const i = part.indexOf('=');
    return [part.slice(0, i).toUpperCase(), part.slice(i + 1).toUpperCase()];
  }));
  const month = rule.BYMONTH ? +rule.BYMONTH : start.month;
  const monthDays = rule.BYMONTHDAY ? rule.BYMONTHDAY.split(',').map(Number) : null;
  const byDays = rule.BYDAY ? rule.BYDAY.split(',') : null;
  for (let year = Math.max(start.year, 2026); year <= 2027; year++) {
    if (!monthDays && !byDays) {
      if (year > start.year) add(year, month, start.day);
      continue;
    }
    if (year === start.year) continue;
    for (let day = 1; day <= daysInMonth(year, month); day++) {
      if (monthDays && !monthDays.includes(day)) continue;
      if (byDays && !byDays.some((spec) => {
        const match = spec.match(/^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/);
        if (!match || weekday(year, month, day) !== match[2]) return false;
        if (!match[1]) return true;
        const ordinal = Math.floor((day - 1) / 7) + 1;
        const reverseOrdinal = -Math.floor((daysInMonth(year, month) - day) / 7) - 1;
        return +match[1] > 0 ? ordinal === +match[1] : reverseOrdinal === +match[1];
      })) continue;
      add(year, month, day);
    }
  }
  return [...result];
}

function localPathFromImage(image) {
  if (!image) return null;
  let pathname = image;
  try { if (/^https?:\/\//i.test(image)) pathname = new URL(image).pathname; } catch { return null; }
  const resolved = path.resolve(PUBLIC, pathname.replace(/^\/+/, ''));
  return resolved.startsWith(`${PUBLIC}${path.sep}`) && fs.existsSync(resolved) ? resolved : null;
}

function tokens(text) {
  return text.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/).filter((word) => word.length > 2 && !['the', 'and', 'for', 'day', 'feast', 'with', 'from'].includes(word));
}

function chooseBookArt(event, dates, bookFiles) {
  const titleTokens = tokens(event.SUMMARY);
  const titleSlug = slug(event.SUMMARY);
  const candidates = bookFiles.map((file) => {
    const name = path.basename(file).toLowerCase();
    let score = tokens(name).filter((word) => titleTokens.includes(word)).length * 3;
    if (name.includes(titleSlug)) score += 20;
    for (const date of dates) {
      const [year, month, day] = date.split('-').map(Number);
      if (name.startsWith(`${MONTHS[month]}-${String(day).padStart(2, '0')}`)) score += 8;
    }
    if (/edsr\d+-print/i.test(name)) score += 1;
    return { file, score };
  }).sort((a, b) => b.score - a.score);
  return candidates[0]?.score > 0 ? candidates[0].file : null;
}

function slug(text) {
  return text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 54);
}

async function main() {
  if (!fs.existsSync(DIST_ICS)) throw new Error(`Missing final MSS feed: ${DIST_ICS}`);
  fs.mkdirSync(PUBLIC_ART, { recursive: true });
  fs.mkdirSync(DIST_ART, { recursive: true });
  const bookFiles = fs.existsSync(BOOK_ART)
    ? fs.readdirSync(BOOK_ART).filter((name) => /\.(png|jpe?g|webp|svg)$/i.test(name)).map((name) => path.join(BOOK_ART, name))
    : [];
  const priorManifest = fs.existsSync(MANIFEST_PATH)
    ? JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')).events || {}
    : {};
  const events = readEvents().map((event) => ({ ...event, dates: occurrenceDates(event) }))
    .filter((event) => event.dates.length > 0);
  const records = {};
  const unresolved = [];

  for (const event of events) {
    let source = localPathFromImage(event['X-IMAGE']);
    let sourceType = 'MSS calendar artwork';
    if (!source) {
      source = chooseBookArt(event, event.dates, bookFiles);
      sourceType = 'MSS book illustration';
    }
    if (!source && priorManifest[event.UID]) {
      source = localPathFromImage(priorManifest[event.UID].image);
      sourceType = 'Stored PhotoPainter background';
    }
    if (!source) {
      unresolved.push({ uid: event.UID, title: event.SUMMARY, dates: event.dates });
      continue;
    }
    if (path.basename(source).includes('photopainter-background-v1')) {
      sourceType = 'AI-generated interpretive illustration';
    }
    const hash = crypto.createHash('sha256').update(event.UID).digest('hex').slice(0, 8);
    const filename = `${slug(event.SUMMARY)}-${hash}-photopainter.png`;
    const publicFile = path.join(PUBLIC_ART, filename);
    const distFile = path.join(DIST_ART, filename);
    const sourceRelative = path.relative(ROOT, source).replace(/\\/g, '/');
    // Sharp rejects an input path that is also its output path. This happens
    // on clean CI builds when the prior manifest points back to this event's
    // already-generated public PNG, so detach the input before overwriting it.
    const imageInput = path.resolve(source) === path.resolve(publicFile)
      ? fs.readFileSync(source)
      : source;
    await sharp(imageInput)
      .rotate()
      .resize(WIDTH, HEIGHT, { fit: 'cover', position: sharp.strategy.attention })
      .png({ palette: true, colours: 6, dither: 1, compressionLevel: 9 })
      .toFile(publicFile);
    fs.copyFileSync(publicFile, distFile);
    records[event.UID] = {
      title: event.SUMMARY,
      dates: event.dates,
      image: `/mss-daily-art/events/${filename}`,
      source: sourceRelative,
      sourceType,
      width: WIDTH,
      height: HEIGHT,
      palette: 'PhotoPainter six-color',
    };
  }

  if (unresolved.length) {
    throw new Error(`No local artwork found for ${unresolved.length} event(s): ${unresolved.map((event) => event.title).join('; ')}`);
  }
  const manifest = {
    schema: 'mss-photopainter-event-backgrounds-v1',
    coverage: { start: START, end: END },
    generatedAt: new Date().toISOString(),
    display: { width: WIDTH, height: HEIGHT, colors: 6 },
    events: records,
  };
  const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
  fs.writeFileSync(MANIFEST_PATH, serialized);
  fs.writeFileSync(path.join(DIST_ART, MANIFEST_NAME), serialized);
  console.log(`Generated ${Object.keys(records).length} stored PhotoPainter event backgrounds (${START} through ${END}).`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
