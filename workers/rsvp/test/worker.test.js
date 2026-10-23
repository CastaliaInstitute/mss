import {test, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import ICAL from 'ical.js';
import worker, {RsvpRecord, ready} from '../src/index.js';
import {calendarRecord, validateInput, verifyOccurrence} from '../src/calendar.js';
const data = {name: 'Family 🪿', email: 'guest@example.test', event: 'Lantern walk', event_uid: 'lantern@example.test', date: '2026-11-10', response: 'Going', guests: 3, note: 'Cider, lanterns; and\na new line.'};
const feed = ['BEGIN:VCALENDAR','VERSION:2.0','BEGIN:VEVENT','UID:lantern@example.test','DTSTART;VALUE=DATE:20261110','DTEND;VALUE=DATE:20261111','RDATE;VALUE=DATE:20271110','SUMMARY:Lantern walk','END:VEVENT','END:VCALENDAR'].join('\r\n');
const env = () => ({ALLOWED_ORIGIN: 'https://mss.castalia.institute', FEED_URL:'https://mss.castalia.institute/MSS.ics', CALDAV_COLLECTION_URL:'https://cal.castalia.institute/custodian/mss-rsvps/',CALDAV_USER:'mss-rsvp',CALDAV_PASSWORD:'test-only',RECORD_SECRET:'x'.repeat(32),TURNSTILE_SECRET_KEY:'test-only',RESEND_API_KEY:'test-only',EMAIL_FROM:'rsvp@castalia.institute',RECIPIENT:'custodian@castalia.institute',RSVPS:{idFromName: id => id,get: () => ({fetch: async () => Response.json({ok:true},{status:202})})},RATE_LIMITER:{limit:async()=>({success:true})}});
const originalFetch = globalThis.fetch;
afterEach(() => {globalThis.fetch = originalFetch;});
const req = (body = {...data,turnstileToken:'test-token'}, origin='https://mss.castalia.institute') => new Request('https://rsvp.castalia.institute/rsvp',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.1'},body:JSON.stringify(body)});
function context() {
 const map = new Map(); let alarm;
 const storage = {get:async k=>structuredClone(map.get(k)),put:async(k,v)=>map.set(k,structuredClone(v)),setAlarm:async v=>{alarm=v;},transaction:async f=>f(storage)};
 return {storage,blockConcurrencyWhile:f=>f(),map,get alarm(){return alarm;}};
}
test('reject invalid input and impossible dates; decline must have zero guests',()=>{
 for(const patch of [{date:'2026-02-30'},{name:'evil\r\nATTENDEE:x'},{guests:0},{response:'maybe'},{response:'Not going',guests:2},{note:'a'.repeat(1001)}]) assert.throws(()=>validateInput({...data,...patch}));
 assert.equal(validateInput({...data,response:'Not going',guests:0}).guests,0);
});
test('match actual occurrences, not fabricated dates or titles',()=>{
 assert.ok(verifyOccurrence(feed,data));
 assert.ok(verifyOccurrence(feed,{...data,date:'2027-11-10'}));
 assert.equal(verifyOccurrence(feed,{...data,date:'2027-11-11'}),false);
 assert.equal(verifyOccurrence(feed,{...data,event:'Forged title'}),false);
});
test('private calendar records round-trip Unicode, escaped text and PARTSTAT without invitations',()=>{
 const text=calendarRecord({...data,response:'Not going',guests:0,note:data.note+'🪿'.repeat(100)},'opaque',4);
 for(const line of text.split('\r\n')) assert.ok(Buffer.byteLength(line)<=75);
 const event=new ICAL.Component(ICAL.parse(text)).getFirstSubcomponent('vevent');
 assert.equal(event.getFirstPropertyValue('class'),'PRIVATE');
 assert.equal(event.getFirstPropertyValue('description').includes(data.note),true);
 assert.equal(event.getFirstProperty('attendee').getParameter('partstat'),'DECLINED');
 assert.equal(event.getFirstPropertyValue('sequence'),4);
 assert.ok(!text.includes('METHOD:REQUEST'));
});
test('fail closed when secrets absent, origin wrong, or rate limit exceeded',async()=>{
 assert.equal(ready({}),false);
 assert.equal((await worker.fetch(req(),{})).status,403);
 assert.equal((await worker.fetch(req(),{ALLOWED_ORIGIN:'https://mss.castalia.institute'})).status,503);
 assert.equal((await worker.fetch(req({},'https://evil.test'),env())).status,403);
 const e=env();e.RATE_LIMITER.limit=async()=>({success:false});
 assert.equal((await worker.fetch(req(),e)).status,429);
});
test('verify bot hostname/action; reject unknown events; only acknowledge durable acceptance',async()=>{
 let proof={success:true,hostname:'mss.castalia.institute',action:'rsvp'};
 globalThis.fetch=async url=>String(url).includes('siteverify')?Response.json(proof):new Response(feed);
 assert.equal((await worker.fetch(req(),env())).status,202);
 proof.hostname='evil.test';assert.equal((await worker.fetch(req(),env())).status,403);
 proof.hostname='mss.castalia.institute';proof.action='login';assert.equal((await worker.fetch(req(),env())).status,403);
 proof.action='rsvp';assert.equal((await worker.fetch(req({...data,date:'2027-11-11',turnstileToken:'token'}),env())).status,400);
 const e=env();e.RSVPS.get=()=>({fetch:async()=>{throw new Error('storage unavailable');}});
 assert.equal((await worker.fetch(req(),e)).status,503);
});
test('durable acceptance deduplicates replays; failed calendar writes never notify',async()=>{
 const ctx=context(), record=new RsvpRecord(ctx,env());
 const submit=()=>record.fetch(new Request('https://private/submit',{method:'POST',body:JSON.stringify({data,id:'opaque'})}));
 assert.equal((await submit()).status,202);assert.ok(ctx.alarm);
 assert.equal((await submit()).status,202);assert.equal(ctx.map.get('record').version,0);
 globalThis.fetch=async()=>new Response('',{status:401});
 await record.alarm();assert.equal(ctx.map.get('record').calendar,false);assert.equal(ctx.map.get('record').email,false);assert.equal(ctx.map.get('record').attempts,1);assert.ok(ctx.map.get('record').data);
});
test('create collection, retry notification without duplicate calendar writes, then remove queued PII',async()=>{
 const ctx=context(), e=env();e.MATRIX_HOMESERVER='https://matrix.castalia.institute';e.MATRIX_ACCESS_TOKEN='test';e.MATRIX_ROOM_ID='!private:test';
 const record=new RsvpRecord(ctx,e);await record.fetch(new Request('https://private/submit',{method:'POST',body:JSON.stringify({data,id:'opaque'})}));
 const calls=[];let fail=true;
 globalThis.fetch=async(url,options)=>{
  calls.push([String(url),options]);assert.equal(options.redirect,'error');
  if(options.method==='PROPFIND')return new Response('',{status:404});
  if(options.method==='MKCALENDAR')return new Response('',{status:201});
  if(String(url).endsWith('.ics'))return new Response('',{status:201});
  if(String(url).includes('resend'))return Response.json({id:'mail'});
  return fail?Response.json({error:'try later'},{status:503}):Response.json({event_id:'message'});
 };
 await record.alarm();assert.equal(ctx.map.get('record').calendar,true);assert.equal(ctx.map.get('record').email,true);assert.ok(ctx.map.get('record').data);
 fail=false;await record.alarm();assert.equal(ctx.map.get('record').data,undefined);assert.equal(ctx.map.get('record').matrix,true);
 assert.equal(calls.filter(([url])=>url.endsWith('.ics')).length,1);
 assert.equal(calls.filter(([url])=>url.includes('resend')).length,1);
 assert.equal(calls.filter(([url])=>url.includes('/send/')).length,2);
});
test('annual weekday rules and exclusion dates are respected',()=>{
 const recurring=feed.replace('RDATE;VALUE=DATE:20271110','RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=SA;BYMONTHDAY=12,13,14,15,16,17,18\r\nEXDATE;VALUE=DATE:20261110');
 assert.equal(verifyOccurrence(recurring,data),false);
 assert.ok(verifyOccurrence(recurring,{...data,date:'2026-11-14'}));
 assert.ok(verifyOccurrence(recurring,{...data,date:'2033-11-12'}));
 assert.equal(verifyOccurrence(recurring,{...data,date:'2033-11-13'}),false);
});
test('reject oversized bodies before parsing',async()=>{
 assert.equal((await worker.fetch(req({...data,note:'x'.repeat(15000)}),env())).status,413);
});
