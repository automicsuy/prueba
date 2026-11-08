// GET /api/noticias → noticias recientes de los jugadores de la selección y de la Celeste,
// con título, copete, foto, medio y enlace directo a la nota.
// Fuentes: Bing Noticias (RSS con copete e imagen) y medios uruguayos (Tenfield, la diaria, Teledoce,
// Montevideo Portal). Si una nota no trae foto o copete, se leen de la propia página (og:image / og:description).
const { send } = require('./_lib');
const { pool } = require('./_uru');
const { getActivePlayers, playerMatcher, norm } = require('./_players');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
const BING = q => `https://www.bing.com/news/search?q=${encodeURIComponent(q)}&format=rss&setlang=es&cc=UY&mkt=es-XL`;
const UY_FEEDS = [
  { url: 'https://www.tenfield.com.uy/feed/', src: 'Tenfield' },
  // Medios generales: solo notas de sus secciones de deportes.
  { url: 'https://ladiaria.com.uy/feeds/articulos/', src: 'la diaria', only: /\/deporte/i },
  { url: 'https://www.teledoce.com/feed/', src: 'Teledoce', only: /deporte|futbol|seleccion/i },
  { url: 'https://www.montevideo.com.uy/anxml.aspx?59', src: 'Montevideo Portal', only: /deporte|futbol|seleccion/i },
];
const GENERAL = ['"selección uruguaya"', '"selección uruguaya" convocados', '"Uruguay Sub-20"'];
const SEL_RE = /selecci[oó]n uruguaya|la celeste|\bcelestes?\b|bielsa|uruguay sub[- ]?20|eliminatorias.*uruguay|uruguay.*eliminatorias/i;
const MAX_AGE = 10 * 86400_000;
const ENRICH = 90; // máximo de notas a completar leyendo la página

async function fetchText(url, ms = 9000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal, redirect: 'follow', headers: { 'user-agent': UA, 'accept-language': 'es-UY,es;q=0.9', accept: 'text/html,application/rss+xml,application/xml,*/*' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally { clearTimeout(t); }
}

const decode = s => String(s || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&(#\d+|#x[\da-f]+|amp|lt|gt|quot|apos|nbsp|hellip);/gi, m => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&nbsp;': ' ', '&hellip;': '…' }[m.toLowerCase()]
    || (m[1] === '#' ? String.fromCodePoint(m[2].toLowerCase() === 'x' ? parseInt(m.slice(3, -1), 16) : parseInt(m.slice(2, -1), 10)) : m)))
  .replace(/\s+/g, ' ').trim();
const tag = (block, name) => { const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i')); return m ? m[1] : ''; };
const clean = s => decode(s).replace(/\s*(Leer más|Seguir leyendo|The post .*)$/i, '').slice(0, 320);

function parseRss(xml, fallbackSrc) {
  return [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)].map(([b]) => {
    let link = decode(tag(b, 'link'));
    const real = /[?&]url=([^&]+)/.exec(link); // Bing envuelve el enlace real
    if (real) link = decodeURIComponent(real[1]);
    let img = decode(tag(b, 'News:Image'));
    if (img) img = `${img.replace(/^http:/, 'https:')}&w=720&h=405&c=14`;
    else img = (b.match(/<media:(?:content|thumbnail)[^>]+url="([^"]+)"/i) || b.match(/<enclosure[^>]+url="([^"]+)"[^>]*type="image/i) || b.match(/<img[^>]+src="([^"]+)"/i) || [])[1] || '';
    return {
      t: decode(tag(b, 'title')), link,
      src: (decode(tag(b, 'News:Source')) || fallbackSrc || '').replace(/ on MSN$/i, ''),
      date: new Date(decode(tag(b, 'pubDate')) || Date.now()).toISOString(),
      desc: clean(tag(b, 'description')), img: decode(img),
    };
  });
}

// Lee og:image / og:description de la nota (solo lo necesario).
const meta = (html, prop) => decode((html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)`, 'i'))
  || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, 'i')) || [])[1]);
async function enrich(it) {
  try {
    const html = (await fetchText(it.link, 4500)).slice(0, 200_000);
    if (!it.img) it.img = meta(html, 'og:image') || meta(html, 'twitter:image');
    if (!it.desc || it.desc.length < 40) it.desc = clean(meta(html, 'og:description') || meta(html, 'description'));
  } catch { /* la nota queda como está */ }
}

const domainOf = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

module.exports = async (req, res) => {
  try {
    const players = await getActivePlayers(req.headers.host);
    const match = playerMatcher(players);
    // Búsquedas: una por jugador para los de la Mayor más recientes; el resto agrupados de a 4 con OR.
    const sorted = players.slice().sort((a, b) => (b.mayor - a.mayor) || b.last.localeCompare(a.last));
    const solo = sorted.filter(p => p.mayor && p.last >= '2024').slice(0, 60);
    const rest = sorted.filter(p => !solo.includes(p));
    const queries = solo.map(p => `"${p.n}"`);
    for (let i = 0; i < rest.length; i += 4) queries.push(rest.slice(i, i + 4).map(p => `"${p.n}"`).join(' OR '));
    const jobs = [
      ...queries.map(q => ({ url: BING(q) })),
      ...GENERAL.map(q => ({ url: BING(q) })),
      ...UY_FEEDS.map(f => ({ url: f.url, src: f.src, only: f.only })),
    ];
    const errors = [];
    const lists = await pool(jobs, 10, async j => {
      try { return parseRss(await fetchText(j.url), j.src).filter(it => !j.only || j.only.test(it.link)); }
      catch (e) { errors.push(`${j.src || 'Bing'}: ${e.message}`); return []; }
    });
    const now = Date.now();
    const seen = new Set();
    let items = [];
    for (const it of lists.flat()) {
      if (!it?.t || !it.link || now - Date.parse(it.date) > MAX_AGE) continue;
      const key = norm(it.t).replace(/[^a-z0-9]/g, '').slice(0, 80);
      if (seen.has(key) || seen.has(it.link)) continue;
      const text = `${it.t} ${it.desc}`;
      const ids = match(text);
      const sel = SEL_RE.test(text);
      if (!ids.length && !sel) continue; // solo notas sobre jugadores de la selección o la Celeste
      seen.add(key); seen.add(it.link);
      items.push({ ...it, ids, sel, domain: domainOf(it.link) });
    }
    items.sort((a, b) => b.date.localeCompare(a.date));
    items = items.slice(0, 300);
    // Completar foto y copete de las más recientes que no los traen.
    await pool(items.filter(i => !i.img || !i.desc || i.desc.length < 40).slice(0, ENRICH), 16, enrich);
    const people = Object.fromEntries(players.map(p => [p.id, { n: p.n, photo: p.photo || '' }]));
    res.setHeader('cache-control', 'public, max-age=0, s-maxage=1800, stale-while-revalidate=21600');
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ items, people, errors, builtAt: new Date().toISOString() }));
  } catch (e) {
    send(res, 502, { error: String(e.message || e) });
  }
};
