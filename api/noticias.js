// GET /api/noticias → noticias recientes de los jugadores de la selección y de la Celeste.
// Fuentes: Google Noticias (es-419, Uruguay) y feeds de medios uruguayos (Tenfield, La Diaria, Teledoce, Montevideo Portal).
const { send } = require('./_lib');
const { pool } = require('./_uru');
const { getActivePlayers, playerMatcher, norm } = require('./_players');

const GN = q => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=es-419&gl=UY&ceid=UY:es-419`;
const UY_FEEDS = [
  { url: 'https://www.tenfield.com.uy/feed/', src: 'Tenfield' },
  { url: 'https://ladiaria.com.uy/feeds/articulos/', src: 'la diaria' },
  { url: 'https://www.teledoce.com/feed/', src: 'Teledoce' },
  { url: 'https://www.montevideo.com.uy/anxml.aspx?59', src: 'Montevideo Portal' },
];
const GENERAL = ['"selección uruguaya"', 'Celeste Bielsa', '"Uruguay Sub-20"'];
const SEL_RE = /selecci[oó]n uruguaya|la celeste|\bcelestes?\b|bielsa|uruguay sub[- ]?20|eliminatorias.*uruguay|uruguay.*eliminatorias/i;
const MAX_AGE = 10 * 86400_000;

async function fetchText(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 9000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'user-agent': 'Mozilla/5.0 (compatible; MiAgenda/1.0)', accept: 'application/rss+xml,application/xml,text/xml,*/*' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally { clearTimeout(t); }
}

const decode = s => String(s || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&(#\d+|#x[\da-f]+|amp|lt|gt|quot|apos|nbsp);/gi, m => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&nbsp;': ' ' }[m.toLowerCase()]
    || (m[1] === '#' ? String.fromCodePoint(m[2].toLowerCase() === 'x' ? parseInt(m.slice(3, -1), 16) : parseInt(m.slice(2, -1), 10)) : m)))
  .replace(/\s+/g, ' ').trim();
const tag = (block, name) => { const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i')); return m ? m[1] : ''; };

function parseRss(xml, fallbackSrc) {
  return [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)].map(([b]) => {
    let title = decode(tag(b, 'title'));
    let src = decode(tag(b, 'source')) || fallbackSrc;
    // Google Noticias agrega " - Medio" al final del título.
    if (!fallbackSrc && src && title.endsWith(` - ${src}`)) title = title.slice(0, -(src.length + 3));
    const img = (b.match(/<media:content[^>]+url="([^"]+)"/i) || b.match(/<enclosure[^>]+url="([^"]+)"/i) || [])[1] || '';
    return { t: title, link: decode(tag(b, 'link')), src, date: new Date(decode(tag(b, 'pubDate')) || Date.now()).toISOString(), desc: decode(tag(b, 'description')).slice(0, 400), img };
  });
}

module.exports = async (req, res) => {
  try {
    const players = await getActivePlayers(req.headers.host);
    const match = playerMatcher(players);
    // Consultas a Google Noticias: nombres agrupados de a 8 con OR, priorizando a los de la Mayor más recientes.
    const sorted = players.slice().sort((a, b) => (b.mayor - a.mayor) || b.last.localeCompare(a.last));
    const queries = [];
    for (let i = 0; i < sorted.length; i += 8) queries.push(sorted.slice(i, i + 8).map(p => `"${p.n}"`).join(' OR '));
    const jobs = [
      ...queries.map(q => ({ url: GN(`(${q}) when:7d`) })),
      ...GENERAL.map(q => ({ url: GN(`${q} when:7d`), general: true })),
      ...UY_FEEDS.map(f => ({ url: f.url, src: f.src })),
    ];
    const errors = [];
    const lists = await pool(jobs, 10, async j => {
      try { return parseRss(await fetchText(j.url), j.src).map(it => ({ ...it, general: !!j.general })); }
      catch (e) { errors.push(`${j.src || 'Google'}: ${e.message}`); return []; }
    });
    const now = Date.now();
    const seen = new Set();
    const items = [];
    for (const it of lists.flat()) {
      if (!it?.t || !it.link) continue;
      if (now - Date.parse(it.date) > MAX_AGE) continue;
      const key = norm(it.t).replace(/[^a-z0-9]/g, '').slice(0, 80);
      if (seen.has(key)) continue;
      const ids = match(`${it.t} ${it.desc}`);
      const sel = SEL_RE.test(`${it.t} ${it.desc}`);
      // Solo quedan las que mencionan a un jugador o a la selección (o vienen de las búsquedas generales).
      if (!ids.length && !sel && !it.general) continue;
      seen.add(key);
      items.push({ t: it.t, link: it.link, src: it.src, date: it.date, img: it.img, ids, sel });
    }
    items.sort((a, b) => b.date.localeCompare(a.date));
    const names = Object.fromEntries(players.map(p => [p.id, p.n]));
    res.setHeader('cache-control', 'public, max-age=0, s-maxage=1800, stale-while-revalidate=21600');
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ items: items.slice(0, 400), names, errors, builtAt: new Date().toISOString() }));
  } catch (e) {
    send(res, 502, { error: String(e.message || e) });
  }
};
