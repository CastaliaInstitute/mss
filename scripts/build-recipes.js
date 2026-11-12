#!/usr/bin/env node
// Render static recipe and agenda pages from public/recipes/*.json.
//   dist/recipes/index.html          all recipes, grouped by event
//   dist/recipes/<slug>/index.html   one recipe
//   dist/agenda/index.html           all event agendas
//   dist/agenda/<event-slug>/index.html  a suggested day for one event
// Runs as part of `npm run build` after vite so the pages sit next to the app.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'public', 'recipes');
const OUT = path.join(ROOT, 'dist', 'recipes');
const AGENDA_OUT = path.join(ROOT, 'dist', 'agenda');
const SITE = 'https://mss.castalia.institute';

const recipes = JSON.parse(fs.readFileSync(path.join(SRC, 'recipes.json'), 'utf8'));
const links = JSON.parse(fs.readFileSync(path.join(SRC, 'links.json'), 'utf8'));
const agendas = fs.existsSync(path.join(SRC, 'agendas.json'))
  ? JSON.parse(fs.readFileSync(path.join(SRC, 'agendas.json'), 'utf8'))
  : {};

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const STYLE = `
  :root { color-scheme: light; }
  body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #1f2933;
         background: linear-gradient(135deg, #f0fdf4 0%, #eff6ff 100%); min-height: 100vh; }
  .wrap { max-width: 44rem; margin: 0 auto; padding: 2rem 1.25rem 4rem; }
  .brand { text-align: center; margin-bottom: 1.5rem; }
  .brand a { color: #1f2933; text-decoration: none; }
  .christmas { font-family: 'Mountains of Christmas', cursive; }
  .brand h1 { font-size: clamp(2rem, 6vw, 3rem); margin: 0; }
  .brand p { margin: 0.25rem 0 0; color: #475569; }
  .card { background: #fff; border-radius: 1rem; padding: 1.5rem; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08); }
  .card h2 { margin: 0 0 0.25rem; font-size: clamp(1.6rem, 5vw, 2.2rem); }
  .events { color: #15803d; font-size: 0.95rem; margin: 0 0 1rem; }
  .events a { color: inherit; }
  .meta { display: flex; flex-wrap: wrap; gap: 0.5rem 1.25rem; color: #475569; font-size: 0.9rem; margin: 0 0 1.25rem; }
  .intro { line-height: 1.6; margin: 0 0 1.25rem; }
  h3 { margin: 1.25rem 0 0.5rem; font-size: 1.1rem; color: #166534; }
  ul, ol { padding-left: 1.4rem; line-height: 1.55; }
  li { margin: 0.25rem 0; }
  .tips { background: #f0fdf4; border-radius: 0.75rem; padding: 0.75rem 1rem 0.75rem 2.2rem; margin-top: 1rem; }
  .back { display: inline-block; margin-top: 1.5rem; color: #15803d; }
  .index h2 { font-size: 1.25rem; margin: 1.5rem 0 0.25rem; color: #166534; }
  .index ul { list-style: none; padding: 0; margin: 0 0 0.5rem; display: flex; flex-wrap: wrap; gap: 0.4rem; }
  .index li a { display: inline-block; background: #fff; border: 1px solid #d1fae5; border-radius: 999px;
                padding: 0.3rem 0.8rem; color: #1f2933; text-decoration: none; font-size: 0.9rem; }
  .index li a:hover { background: #ecfdf5; }
  .count { color: #475569; text-align: center; margin: 0 0 1rem; }
  .agenda { list-style: none; padding: 0; margin: 0; }
  .agenda li { display: grid; grid-template-columns: 7rem 1fr; gap: 0.75rem; padding: 0.75rem 0; border-top: 1px solid #ecfdf5; }
  .agenda li:first-child { border-top: 0; }
  .agenda .time { color: #15803d; font-weight: 600; font-size: 0.9rem; }
  .agenda .activity { font-weight: 600; margin: 0 0 0.2rem; }
  .agenda .detail { margin: 0; line-height: 1.5; color: #334155; }
  .agenda .recipes { margin: 0.35rem 0 0; font-size: 0.9rem; }
  .agenda .recipes a { color: #15803d; }
  .closing { font-style: italic; color: #475569; margin: 1rem 0 0; }
  @media (max-width: 480px) { .agenda li { grid-template-columns: 1fr; gap: 0.2rem; } }

  /* Recipe reading layout: ingredients stay beside the method on a kitchen display. */
  .recipe-page .wrap { max-width: 82rem; padding-top: 1rem; }
  .recipe-page .brand { margin-bottom: 1rem; }
  .recipe-page .brand h1 { font-size: 1.65rem; }
  .recipe-page .brand p { font-size: 0.85rem; }
  .recipe-nav { position: sticky; top: 0; z-index: 10; display: flex; justify-content: space-between; gap: 1rem; padding: 0.4rem 0; margin-bottom: 0.5rem; background: #f0fdf4; }
  .recipe-nav a { display: inline-flex; align-items: center; min-height: 44px; color: #166534; font-weight: 600; text-decoration: none; }
  .recipe-nav a:hover { text-decoration: underline; }
  .recipe-header { border-bottom: 1px solid #e2e8e3; padding-bottom: 1rem; margin-bottom: 1.5rem; }
  .recipe-header .intro { max-width: 70ch; margin-bottom: 0; }
  .recipe-page .card h2 { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; font-size: clamp(1.6rem, 3vw, 2.4rem); line-height: 1.15; }
  .recipe-page .meta { margin-bottom: 0.75rem; }
  .recipe-columns { display: grid; gap: 1.5rem; }
  .recipe-columns h3 { margin-top: 0; font-size: 1.25rem; }
  .recipe-ingredients { background: #f0fdf4; border: 1px solid #dcfce7; border-radius: 0.75rem; padding: 1.25rem; }
  .recipe-ingredients ul { margin-bottom: 0; }
  .recipe-ingredients li { margin: 0.65rem 0; padding-left: 0.2rem; }
  .recipe-method ol { margin-top: 0; padding-left: 1.8rem; }
  .recipe-method ol > li { padding-left: 0.4rem; margin-bottom: 1.1rem; }
  .recipe-method ol > li::marker { color: #166534; font-weight: 700; }
  .recipe-method .tips { padding: 1rem 1.25rem; }
  .recipe-method .tips ul { margin: 0; }
  @media (min-width: 900px) and (orientation: landscape) {
    .recipe-page .brand { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; text-align: left; }
    .recipe-page .card { padding: 1.75rem 2rem; }
    .recipe-columns { grid-template-columns: minmax(16rem, 0.85fr) minmax(0, 1.6fr); gap: 2.5rem; align-items: start; font-size: 1.125rem; line-height: 1.65; }
    .recipe-ingredients { position: sticky; top: 4rem; max-height: calc(100vh - 5rem); overflow-y: auto; overscroll-behavior: contain; }
  }
  @media print {
    .recipe-page { background: white; }
    .recipe-page .wrap { max-width: none; padding: 0; }
    .recipe-page .brand, .recipe-page .back, .recipe-nav { display: none; }
    .recipe-page .card { padding: 0; box-shadow: none; }
    .recipe-columns { display: block; }
    .recipe-ingredients { position: static; max-height: none; overflow: visible; background: white; border: 0; padding: 0; margin-bottom: 1.5rem; }
    .recipe-method li { break-inside: avoid; }
  }
`;

const page = (title, body, description, subtitle = 'Feast-day recipes', bodyClass = '') => `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(title)} · Maybe Something Seasonal</title>
    <meta name="description" content="${esc(description)}" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Mountains+of+Christmas:wght@400;700&display=swap" rel="stylesheet" />
    <style>${STYLE}</style>
  </head>
  <body class="${esc(bodyClass)}">
    <div class="wrap">
      <header class="brand">
        <a href="/"><h1 class="christmas">Maybe Something Seasonal</h1></a>
        <p>${esc(subtitle)}</p>
      </header>
      ${body}
    </div>
    <script>
      // Preserve the event when moving between its agenda, recipes, and recipe index.
      (function () {
        var returnTo = new URLSearchParams(location.search).get('returnTo');
        if (!returnTo) return;
        try {
          var target = new URL(returnTo, location.origin);
          if (target.origin !== location.origin || !/^\\/(?:[0-9]{4}\\/[0-9]{2}\\/?)?$/.test(target.pathname)) return;
          document.querySelectorAll('a[href]').forEach(function (link) {
            var url = new URL(link.getAttribute('href'), location.origin);
            if (url.origin !== location.origin || !/^\\/(recipes|agenda)\\//.test(url.pathname)) return;
            url.searchParams.set('returnTo', target.pathname + target.search);
            link.href = url.pathname + url.search;
          });
        } catch (_) { /* leave normal links unchanged */ }
      })();
    </script>
  </body>
</html>
`;

const list = (items, tag) => `<${tag}>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</${tag}>`;

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
// The app fetches links.json at runtime to hyperlink dishes in event cards.
fs.copyFileSync(path.join(SRC, 'links.json'), path.join(OUT, 'links.json'));

let count = 0;
for (const [slug, r] of Object.entries(recipes)) {
  const dir = path.join(OUT, slug);
  fs.mkdirSync(dir, { recursive: true });
  const meta = [r.yield, r.prepTime && `Prep ${r.prepTime}`, r.cookTime && r.cookTime !== 'none' && `Cook ${r.cookTime}`]
    .filter(Boolean)
    .map((m) => `<span>${esc(m)}</span>`)
    .join('');
  const body = `
      <nav class="recipe-nav" aria-label="Recipe navigation">
        <a id="recipe-return" href="/?kiosk=1">← Back to calendar</a>
        <a href="/recipes/">All recipes</a>
      </nav>
      <article class="card">
        <header class="recipe-header">
        <h2>${esc(r.title)}</h2>
        <p class="events">Served at: ${(r.events || [])
          .map((e) => (agendas[e] ? `<a href="/agenda/${agendas[e].slug}/">${esc(e)}</a>` : esc(e)))
          .join(' · ')}</p>
        <p class="meta">${meta}</p>
        <p class="intro">${esc(r.intro)}</p>
        </header>
        <div class="recipe-columns">
          <section class="recipe-ingredients" aria-labelledby="ingredients-heading">
            <h3 id="ingredients-heading">Ingredients</h3>
            ${list(r.ingredients, 'ul')}
          </section>
          <section class="recipe-method" aria-labelledby="method-heading">
            <h3 id="method-heading">Method</h3>
            ${list(r.steps, 'ol')}
            ${r.tips && r.tips.length ? `<h3>Tips</h3><div class="tips">${list(r.tips, 'ul')}</div>` : ''}
          </section>
        </div>
      </article>
      <a class="back" href="/recipes/">← All feast-day recipes</a>
      <script>
        (function () {
          var returnTo = new URLSearchParams(location.search).get('returnTo');
          if (!returnTo) return;
          try {
            var url = new URL(returnTo, location.origin);
            if (url.origin !== location.origin || !/^\\/(?:[0-9]{4}\\/[0-9]{2}\\/?)?$/.test(url.pathname)) return;
            var link = document.getElementById('recipe-return');
            link.href = url.pathname + url.search;
            link.textContent = url.searchParams.has('event') ? '← Back to event' : '← Back to calendar';
          } catch (_) { /* retain the calendar fallback */ }
        })();
      </script>`;
  fs.writeFileSync(path.join(dir, 'index.html'), page(r.title, body, r.intro.slice(0, 160), 'Feast-day recipes', 'recipe-page'));
  count += 1;
}

// index grouped by event, in the order events appear in links.json (ICS order)
const sections = Object.entries(links)
  .filter(([, dishes]) => dishes.length)
  .map(
    ([summary, dishes]) => `
      <h2>${esc(summary)}</h2>
      <ul>${dishes
        .filter((d) => recipes[d.slug])
        .map((d) => `<li><a href="/recipes/${d.slug}/">${esc(recipes[d.slug].title)}</a></li>`)
        .join('')}</ul>`,
  )
  .join('');
fs.writeFileSync(
  path.join(OUT, 'index.html'),
  page(
    'Recipes',
    `<p class="count">${count} recipes for the dishes named on the calendar's feast days.</p><div class="index">${sections}</div>`,
    'Home recipes for every dish mentioned on the Maybe Something Seasonal calendar.',
  ),
);
// ── agendas ────────────────────────────────────────────────────────────────
fs.rmSync(AGENDA_OUT, { recursive: true, force: true });
fs.mkdirSync(AGENDA_OUT, { recursive: true });
let agendaCount = 0;
for (const [summary, a] of Object.entries(agendas)) {
  const dir = path.join(AGENDA_OUT, a.slug);
  fs.mkdirSync(dir, { recursive: true });
  const items = a.schedule
    .map(
      (s) => `<li><div class="time">${esc(s.time)}</div><div>
        <p class="activity">${esc(s.activity)}</p>
        <p class="detail">${esc(s.detail)}</p>
        ${s.recipes && s.recipes.length
          ? `<p class="recipes">Recipes: ${s.recipes
              .filter((slug) => recipes[slug])
              .map((slug) => `<a href="/recipes/${slug}/">${esc(recipes[slug].title)}</a>`)
              .join(' · ')}</p>`
          : ''}
      </div></li>`,
    )
    .join('');
  const dishes = (links[summary] || []).filter((d) => recipes[d.slug]);
  const body = `
      <article class="card">
        <h2 class="christmas">${esc(summary)}</h2>
        <p class="events">${esc(a.title)}</p>
        <p class="intro">${esc(a.intro)}</p>
        ${a.resources?.length ? `<h3>Event resources</h3><ul>${a.resources.map(r => `<li><a href="${esc(r.url)}">${esc(r.label)}</a></li>`).join('')}</ul>` : ''}
        <ol class="agenda">${items}</ol>
        ${a.closing ? `<p class="closing">${esc(a.closing)}</p>` : ''}
        ${dishes.length
          ? `<h3>Feast-day recipes</h3><div class="index"><ul>${dishes
              .map((d) => `<li><a href="/recipes/${d.slug}/">${esc(recipes[d.slug].title)}</a></li>`)
              .join('')}</ul></div>`
          : ''}
      </article>
      <a class="back" href="/agenda/">← All agendas</a>`;
  fs.writeFileSync(path.join(dir, 'index.html'), page(`${summary} — agenda`, body, a.intro.slice(0, 160), 'A day for each feast'));
  agendaCount += 1;
}
fs.writeFileSync(
  path.join(AGENDA_OUT, 'index.html'),
  page(
    'Agendas',
    `<p class="count">A suggested day for each of the ${agendaCount} observances on the calendar.</p><div class="index"><ul>${Object.entries(agendas)
      .map(([summary, a]) => `<li><a href="/agenda/${a.slug}/">${esc(summary)}</a></li>`)
      .join('')}</ul></div>`,
    'A suggested day of traditions and food for every event on the Maybe Something Seasonal calendar.',
    'A day for each feast',
  ),
);
fs.copyFileSync(path.join(SRC, 'agendas.json'), path.join(OUT, 'agendas.json'));
if (fs.existsSync(path.join(SRC, 'greetings.json'))) {
  fs.copyFileSync(path.join(SRC, 'greetings.json'), path.join(OUT, 'greetings.json'));
}
console.log(`Built ${agendaCount} agenda pages + index → ${path.relative(ROOT, AGENDA_OUT)}`);
// ── ICS: agenda + recipe links in every event's DESCRIPTION (and URL) ─────
// Calendar apps can't render the site's hyperlinks, so the built feed gets
// the same links as plain text after the event's metadata block, plus a URL
// property pointing at the agenda when the event has no URL of its own.
const ICS_OUT = path.join(ROOT, 'dist', 'MSS.ics');
if (fs.existsSync(ICS_OUT)) {
  const icsEscape = (t) => String(t).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,');
  const fold = (line) => {
    const out = [];
    let cur = '';
    for (const ch of line) {
      if (Buffer.byteLength(cur + ch) > (out.length ? 74 : 75)) {
        out.push(cur);
        cur = ch;
      } else cur += ch;
    }
    out.push(cur);
    return out.map((l, i) => (i ? ` ${l}` : l)).join('\n');
  };
  const ics = fs.readFileSync(ICS_OUT, 'utf8');
  const eol = ics.includes('\r\n') ? '\r\n' : '\n';
  let linked = 0;
  const patched = ics.replace(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g, (block) => {
    const unfolded = block.replace(/\r?\n[ \t]/g, '');
    const summary = (unfolded.match(/^SUMMARY:(.*)$/m) || [])[1];
    const agenda = summary && agendas[summary];
    const dishes = summary ? (links[summary] || []).filter((d) => recipes[d.slug]) : [];
    if (!agenda && !dishes.length) return block;
    if (/^(Agenda|Recipes):/m.test(unfolded)) return block; // already patched
    const extra = [];
    if (agenda) extra.push(`Agenda: ${SITE}/agenda/${agenda.slug}/`);
    if (dishes.length) {
      extra.push('Recipes:');
      for (const d of dishes) extra.push(`${icsEscape(recipes[d.slug].title)}: ${SITE}/recipes/${d.slug}/`);
    }
    const lines = unfolded.split(/\r?\n/).map((line) => {
      if (!line.startsWith('DESCRIPTION:')) return line;
      return fold(`${line}\\n\\n${extra.join('\\n')}`);
    });
    if (agenda && !/^URL:/m.test(unfolded)) {
      const at = lines.findIndex((l) => l.startsWith('END:VEVENT'));
      lines.splice(at, 0, `URL:${SITE}/agenda/${agenda.slug}/`);
    }
    linked += 1;
    return lines.join(eol);
  });
  fs.writeFileSync(ICS_OUT, patched);
  console.log(`Added agenda/recipe links to ${linked} VEVENT descriptions in dist/MSS.ics`);
}

console.log(`Built ${count} recipe pages + index → ${path.relative(ROOT, OUT)} (${SITE}/recipes/)`);
