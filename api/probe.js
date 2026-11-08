// TEMPORAL: cobertura de fotos de jugadores en Wikidata (se elimina antes de producción).
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
module.exports = async (req, res) => {
  const out = {};
  try {
    const q = `SELECT ?p ?es ?en ?dob ?img WHERE { ?p wdt:P27 wd:Q77; wdt:P106 wd:Q937857; wdt:P18 ?img; wdt:P569 ?dob. FILTER(YEAR(?dob) >= 1984) OPTIONAL{?p rdfs:label ?es FILTER(LANG(?es)="es")} OPTIONAL{?p rdfs:label ?en FILTER(LANG(?en)="en")} }`;
    const r = await fetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(q)}`, { headers: { 'user-agent': 'Celestes/1.0 (uso personal)', accept: 'application/sparql-results+json' } });
    const rows = (await r.json()).results.bindings;
    out.wikidataConFoto = rows.length;
    const byName = new Map();
    rows.forEach(b => [b.es?.value, b.en?.value].forEach(n => n && byName.set(norm(n), b.img.value)));
    const j = await (await fetch('https://mi-agenda-deportiva-roan.vercel.app/api/jugadores')).json();
    const players = j.players || [];
    const hits = players.filter(p => byName.has(norm(p.n)));
    out.jugadores = players.length; out.conFoto = hits.length;
    out.sinFoto = players.filter(p => !byName.has(norm(p.n))).slice(0, 30).map(p => p.n);
    out.ejemplo = hits.slice(0, 3).map(p => ({ n: p.n, img: byName.get(norm(p.n)) }));
  } catch (e) { out.error = String(e.stack); }
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(out, null, 1));
};
