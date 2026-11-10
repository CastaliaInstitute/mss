#!/usr/bin/env node

// Build compact, date-addressable MSS pages for the PhotoPainter and other
// small-screen readers. MSS.ics remains the calendar authority; dated book
// manuscripts add an explicitly separate authored layer.
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const ICS = path.join(DIST, 'MSS.ics');
const EVENT_BACKGROUND_MANIFEST = path.join(ROOT, 'public', 'mss-daily-art', 'events', 'photopainter-event-backgrounds.json');
const SITE = 'https://mss.castalia.institute';
const FIRST_YEAR = 2026;
const LAST_YEAR = 2035;
const MONTHS = Object.fromEntries(
  'january february march april may june july august september october november december'
    .split(' ').map((name, index) => [name, index + 1]),
);

function unescapeIcs(value = '') {
  return value.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
}

function unfoldIcs(text) {
  return text.replace(/\r?\n[ \t]/g, '');
}

function readEvents() {
  const rows = unfoldIcs(fs.readFileSync(ICS, 'utf8')).split(/\r?\n/);
  const events = [];
  let current = null;
  for (const row of rows) {
    if (row === 'BEGIN:VEVENT') { current = {}; continue; }
    if (row === 'END:VEVENT') { if (current) events.push(current); current = null; continue; }
    if (!current) continue;
    const colon = row.indexOf(':');
    if (colon < 0) continue;
    const key = row.slice(0, colon).split(';')[0].toUpperCase();
    const value = row.slice(colon + 1);
    if (['DTSTART', 'SUMMARY', 'DESCRIPTION', 'URL', 'X-IMAGE', 'RRULE', 'RDATE', 'UID', 'CATEGORIES'].includes(key)) {
      if (key === 'RDATE') current[key] = [...(current[key] || []), value];
      else current[key] = value;
    }
  }
  return events;
}

function dateKey(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseIcsDate(value) {
  const match = value && value.match(/(\d{4})(\d{2})(\d{2})/);
  return match ? { year: +match[1], month: +match[2], day: +match[3] } : null;
}

function monthDays(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function weekdayCode(day) {
  return ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][day];
}

function datesForEvent(event) {
  const start = parseIcsDate(event.DTSTART);
  if (!start) return [];
  const dates = new Set();
  const add = (year, month, day) => {
    if (year >= FIRST_YEAR && year <= LAST_YEAR && day >= 1 && day <= monthDays(year, month)) {
      dates.add(dateKey(year, month, day));
    }
  };
  add(start.year, start.month, start.day);
  for (const list of event.RDATE || []) {
    for (const value of list.split(',')) {
      const date = parseIcsDate(value);
      if (date) add(date.year, date.month, date.day);
    }
  }

  if (event.RRULE && /^FREQ=YEARLY(?:;|$)/i.test(event.RRULE)) {
    const rule = Object.fromEntries(event.RRULE.split(';').map((part) => {
      const i = part.indexOf('='); return [part.slice(0, i).toUpperCase(), part.slice(i + 1).toUpperCase()];
    }));
    const month = rule.BYMONTH ? +rule.BYMONTH : start.month;
    const byMonthDays = rule.BYMONTHDAY ? rule.BYMONTHDAY.split(',').map(Number) : null;
    const byDay = rule.BYDAY ? rule.BYDAY.split(',') : null;
    for (let year = Math.max(FIRST_YEAR, start.year); year <= LAST_YEAR; year++) {
      if (!byMonthDays && !byDay) {
        if (year > start.year) add(year, month, start.day);
        continue;
      }
      if (year === start.year) continue;
      for (let day = 1; day <= monthDays(year, month); day++) {
        if (byMonthDays && !byMonthDays.includes(day)) continue;
        if (byDay && !byDay.some((spec) => {
          const m = spec.match(/^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/);
          if (!m || weekdayCode(new Date(Date.UTC(year, month - 1, day)).getUTCDay()) !== m[2]) return false;
          if (!m[1]) return true;
          const ordinal = Math.floor((day - 1) / 7) + 1;
          const reverseOrdinal = -Math.floor((monthDays(year, month) - day) / 7) - 1;
          return +m[1] > 0 ? ordinal === +m[1] : reverseOrdinal === +m[1];
        })) continue;
        add(year, month, day);
      }
    }
  }
  return [...dates];
}

function cleanText(text) {
  return unescapeIcs(text).replace(/\\[Nn]/g, ' ').replace(/\s+/g, ' ').trim();
}

function deviceText(value) {
  return value.replace(/\p{Extended_Pictographic}/gu, '').replace(/[\uFE0F\u200D]/g, '').replace(/\s+/g, ' ').trim();
}

function prop(description, name) {
  const unfolded = unescapeIcs(description).replace(/\\[Nn]/g, '\n');
  const line = unfolded.match(new RegExp(`(?:^|\\n)${name}:\\s*([^\\n]+)`, 'i'));
  return line ? cleanText(line[1]) : '';
}

function eventRecord(event, eventBackgrounds) {
  const desc = event.DESCRIPTION || '';
  const storedBackground = eventBackgrounds[event.UID];
  return {
    title: deviceText(unescapeIcs(event.SUMMARY || 'Seasonal observance')),
    icon: prop(desc, 'Icon'),
    category: prop(desc, 'Category'),
    description: deviceText([prop(desc, 'History'), prop(desc, 'Meaning'), prop(desc, 'Day'), prop(desc, 'Agenda')]
      .filter(Boolean).join(' ')).slice(0, 520),
    image: storedBackground
      ? new URL(storedBackground.image, SITE).toString()
      : (event['X-IMAGE'] ? new URL(event['X-IMAGE'], SITE).toString() : ''),
    backgroundSource: storedBackground ? storedBackground.source : '',
    url: event.URL ? unescapeIcs(event.URL) : '',
    uid: event.UID || '',
  };
}

function plainMarkdown(text) {
  return text
    .replace(/^---[\s\S]*?---\s*/m, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstParagraph(text) {
  const blocks = text.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
  for (const block of blocks) {
    if (/^(#|\*\*Date:|\*\*Calendar|\*\*Event:|\*\*Status:|\*\*Checked:|\*\*No MSS event)/i.test(block)) continue;
    const result = plainMarkdown(block);
    if (result) return result.slice(0, 440);
  }
  return '';
}

function findSection(text, headingPattern) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => /^#{2,4}\s+/.test(line) && headingPattern.test(line));
  if (start < 0) return '';
  const content = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#{1,4}\s+/.test(lines[i])) break;
    content.push(lines[i]);
  }
  return plainMarkdown(content.join('\n')).slice(0, 440);
}

function filenameDate(file, bookYear) {
  const base = path.basename(file).toLowerCase();
  const m = base.match(new RegExp(`(?:${Object.keys(MONTHS).join('|')})[-_](\\d{1,2})`));
  if (!m) return null;
  const monthName = base.match(new RegExp(`(${Object.keys(MONTHS).join('|')})[-_]\\d{1,2}`))?.[1];
  if (!monthName) return null;
  const year = MONTHS[monthName] <= 3 ? bookYear + 1 : bookYear;
  return dateKey(year, MONTHS[monthName], +m[1]);
}

function manuscriptDate(text, file, bookYear) {
  const match = text.match(/(?:\*\*Date:\*\*|^#\s+)[^\n]*?\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:,?\s+(20\d{2}))?/im);
  if (match) {
    const month = MONTHS[match[1].toLowerCase()];
    const year = match[3] ? +match[3] : (month <= 3 ? bookYear + 1 : bookYear);
    return dateKey(year, month, +match[2]);
  }
  return filenameDate(file, bookYear);
}

async function copyArt(file, distArt) {
  const outputName = `${path.basename(file, path.extname(file))}.png`;
  const output = path.join(distArt, outputName);
  await sharp(file).rotate().resize({ width: 480, height: 300, fit: 'inside', withoutEnlargement: true })
    .png({ compressionLevel: 9, palette: true }).toFile(output);
  return `${SITE}/mss-daily-art/${outputName}`;
}

async function main() {
  if (!fs.existsSync(ICS)) throw new Error(`Missing build output: ${ICS}`);
  const dayMap = new Map();
  const eventBackgrounds = fs.existsSync(EVENT_BACKGROUND_MANIFEST)
    ? JSON.parse(fs.readFileSync(EVENT_BACKGROUND_MANIFEST, 'utf8')).events || {}
    : {};
  const ensureDay = (date) => {
    if (!dayMap.has(date)) dayMap.set(date, { date, events: [], bookPages: [] });
    return dayMap.get(date);
  };

  for (const event of readEvents()) {
    const record = eventRecord(event, eventBackgrounds);
    for (const date of datesForEvent(event)) ensureDay(date).events.push(record);
  }

  const bookRoot = path.join(ROOT, 'books');
  const manuscripts = [];
  if (fs.existsSync(bookRoot)) {
    for (const volume of fs.readdirSync(bookRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
      const year = +(volume.name.match(/(20\d{2})/) || [])[1];
      if (!year) continue;
      const manuscriptDir = path.join(bookRoot, volume.name, 'manuscript');
      if (!fs.existsSync(manuscriptDir)) continue;
      for (const name of fs.readdirSync(manuscriptDir).filter((item) => item.endsWith('.md'))) {
        if (/^(title-page|contents|calendar-key|winter-at-a-glance|feature-|recipe-|photo-feature|source)/i.test(name)) continue;
        const file = path.join(manuscriptDir, name);
        const text = fs.readFileSync(file, 'utf8');
        const date = manuscriptDate(text, file, year);
        if (!date || date < `${FIRST_YEAR}-01-01` || date > `${LAST_YEAR}-12-31`) continue;
        manuscripts.push({ date, file, text, name, book: `Maybe Something Seasonal · ${volume.name.replace('-', ' ')}` });
      }
    }
  }

  const distArt = path.join(DIST, 'mss-daily-art');
  fs.mkdirSync(distArt, { recursive: true });
  for (const page of manuscripts) {
    const title = (page.text.match(/^#\s+(.+)$/m)?.[1] || path.basename(page.name, '.md'))
      .replace(/\s*[·|]\s*/g, ' · ').slice(0, 120);
    const explicitImage = page.text.match(/(?:Image:\s*|image file:\s*|`)(art\/[^`\s)]+\.(?:png|jpe?g|webp))`?/i)?.[1];
    const imageMatches = [explicitImage && path.join(ROOT, 'books', path.basename(path.dirname(path.dirname(page.file))), explicitImage)];
    const dateParts = page.date.split('-');
    const monthName = Object.keys(MONTHS).find((name) => MONTHS[name] === +dateParts[1]);
    const dayPrefix = `${monthName}-${dateParts[2]}`;
    const artDir = path.join(ROOT, 'books', path.basename(path.dirname(path.dirname(page.file))), 'art', 'events');
    if (fs.existsSync(artDir)) imageMatches.push(...fs.readdirSync(artDir)
      .filter((name) => name.toLowerCase().startsWith(dayPrefix) && /\.(png|jpe?g|webp)$/i.test(name))
      .sort((a, b) => Number(/edsr3-print/i.test(b)) - Number(/edsr3-print/i.test(a)))
      .map((name) => path.join(artDir, name)));
    let image = '';
    const artFile = imageMatches.find((candidate) => candidate && fs.existsSync(candidate));
    if (artFile) image = await copyArt(artFile, distArt);
    const record = {
      book: page.book,
      title: deviceText(title),
      introduction: deviceText(firstParagraph(page.text)),
      activity: deviceText(findSection(page.text, /\b(try it|activity|make (?:a|an|your|one|the|little|small)|let's make|let us make)\b/i)),
      reflection: (page.text.match(/(?:\*\*Note prompt:\*\*|\*\*Notes(?: from this season)?:\*\*|\*\*Remember:\*\*)\s*([^\n]+)/i)?.[1] || '').replace(/[*_]/g, '').slice(0, 180),
      image,
      source: path.relative(ROOT, page.file).replace(/\\/g, '/'),
    };
    ensureDay(page.date).bookPages.push(record);
  }

  const outRoot = path.join(DIST, 'mss-daily');
  fs.mkdirSync(outRoot, { recursive: true });
  const start = Date.UTC(FIRST_YEAR, 0, 1);
  const end = Date.UTC(LAST_YEAR, 11, 31);
  for (let time = start; time <= end; time += 86400000) {
    const date = new Date(time).toISOString().slice(0, 10);
    const day = ensureDay(date);
    day.events.sort((a, b) => a.title.localeCompare(b.title));
    day.bookPages.sort((a, b) => a.source.localeCompare(b.source));
    const payload = {
      schema: 'mss-daily-v1',
      date,
      weekday: new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }),
      source: `${SITE}/MSS.ics`,
      book: day.bookPages[0]?.book || '',
      events: day.events,
      bookPages: day.bookPages,
      quiet: day.events.length === 0,
      quietLabel: day.events.length === 0 ? 'No MSS calendar event is listed for this date.' : '',
      updated: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(outRoot, `${date}.json`), `${JSON.stringify(payload)}\n`);
  }
  console.log(`Built MSS daily device feed: ${LAST_YEAR - FIRST_YEAR + 1} years, ${dayMap.size} populated dates.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
