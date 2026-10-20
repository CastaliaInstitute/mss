const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'dist', 'MSS.ics');
let ics = fs.readFileSync(file, 'utf8');
const dates = ['20240423','20250412','20260402','20270420'];
const uid = 'machanu-jayanti@maybesomethingseasonal.com';
const next = d => { const t = new Date(Date.UTC(+d.slice(0,4), +d.slice(4,6)-1, +d.slice(6,8)+1)); return t.toISOString().slice(0,10).replace(/-/g,''); };
const event = [
'BEGIN:VEVENT',
'UID:' + uid,
'DTSTAMP:20261020T000000Z',
'DTSTART;VALUE=DATE:' + dates[0],
'DTEND;VALUE=DATE:' + next(dates[0]),
...dates.slice(1).map(d => 'RDATE;VALUE=DATE:' + d),
'SUMMARY:Machanu Jayanti — The Monkey Prince of the Sea',
'DESCRIPTION:Family-created Thai-Indian cultural celebration on Chaitra Purnima alongside Hanuman Jayanti. Not an established traditional religious festival. Tell the Ramakien story of Hanuman\\, Suvannamaccha and their son Machanu. Prepare Thai basil pakora\\, coconut butter paneer\\, red bean curry\\, golden dal\\, coconut basmati rice and mango sticky rice. Decorate in gold\\, white and turquoise. Dates are explicit lunar-calendar instances\\; extend with verified dates after 2027.',
'CATEGORIES:Cultural,Family,Food',
'END:VEVENT'
].join('\r\n');
ics = ics.replace(/BEGIN:VEVENT\r?\n[\s\S]*?END:VEVENT\r?\n/g, block => block.includes('UID:' + uid) ? '' : block);
ics = ics.replace(/END:VCALENDAR\s*$/, event + '\r\nEND:VCALENDAR\r\n');
fs.writeFileSync(file, ics);
console.log('Added Machanu Jayanti verified date instances 2024–2027.');
