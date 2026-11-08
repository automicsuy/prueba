// Fotos de jugadores uruguayos desde Wikidata / Wikimedia Commons (licencias libres).
// Se cruzan por nombre o, si no coincide, por fecha de nacimiento + apellido.
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();

let cache = null;
async function photoIndex() {
  if (cache && Date.now() - cache.t < 24 * 3600_000) return cache.idx;
  const q = `SELECT ?p ?es ?en ?alt ?dob ?img WHERE { ?p wdt:P27 wd:Q77; wdt:P106 wd:Q937857; wdt:P18 ?img; wdt:P569 ?dob. FILTER(YEAR(?dob) >= 1980)
    OPTIONAL{?p rdfs:label ?es FILTER(LANG(?es)="es")} OPTIONAL{?p rdfs:label ?en FILTER(LANG(?en)="en")} OPTIONAL{?p skos:altLabel ?alt FILTER(LANG(?alt)="es")} }`;
  const r = await fetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(q)}`, {
    headers: { 'user-agent': 'Celestes/1.0 (uso personal)', accept: 'application/sparql-results+json' },
  });
  if (!r.ok) throw new Error(`Wikidata HTTP ${r.status}`);
  const byName = new Map(), byDob = new Map();
  (await r.json()).results.bindings.forEach(b => {
    const img = b.img.value.replace(/^http:/, 'https:') + '?width=480';
    [b.es?.value, b.en?.value, b.alt?.value].forEach(n => n && byName.set(norm(n), img));
    const dob = b.dob.value.slice(0, 10);
    if (!dob.endsWith('-01-01')) (byDob.get(dob) || byDob.set(dob, []).get(dob)).push({ names: [b.es?.value, b.en?.value].filter(Boolean).map(norm), img });
  });
  cache = { t: Date.now(), idx: { byName, byDob } };
  return cache.idx;
}

function findPhoto(idx, name, dob) {
  const n = norm(name);
  if (idx.byName.has(n)) return idx.byName.get(n);
  const last = n.split(' ').pop();
  const cands = dob && idx.byDob.get(dob);
  if (cands) for (const c of cands) if (c.names.some(x => x.split(' ').includes(last))) return c.img;
  return '';
}

module.exports = { photoIndex, findPhoto };
