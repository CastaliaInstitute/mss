const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'public', 'recipes');
const target = path.join(dir, 'agendas.json');
const base = JSON.parse(fs.readFileSync(target, 'utf8'));
const additions = JSON.parse(fs.readFileSync(path.join(dir, 'hindu-buddhist-agendas.json'), 'utf8'));
for (const [name, agenda] of Object.entries(additions)) {
  if (!base[name]) base[name] = agenda;
}
fs.writeFileSync(target, JSON.stringify(base, null, 2) + '\n');
