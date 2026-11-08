// TEMPORAL: verificar fuentes de fotos y copetes (se elimina antes de producción).
const { pool } = require('./_uru');
const { getActivePlayers } = require('./_players');
async function get(u, opts = {}) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 8000);
  try { const r = await fetch(u, { signal: ctrl.signal, redirect: 'follow', ...opts, headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36', 'accept-language': 'es-UY,es;q=0.9', ...(opts.headers || {}) } }); return { status: r.status, url: r.url, text: opts.method === 'HEAD' ? '' : await r.text(), type: r.headers.get('content-type') }; }
  catch (e) { return { status: 0, text: String(e) }; } finally { clearTimeout(t); }
}
const meta = (html, prop) => (html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)`, 'i')) || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, 'i')) || [])[1];
module.exports = async (req, res) => {
  const out = {};
  try {
    // 1) Bing Noticias RSS
    const b = await get('https://www.bing.com/news/search?q=%22Federico+Valverde%22&format=rss&setlang=es&cc=UY&mkt=es-XL');
    const items = [...b.text.matchAll(/<item>[\s\S]*?<\/item>/g)].map(m => m[0]);
    out.bing = { status: b.status, items: items.length, sample: items.slice(0, 2).map(x => x.slice(0, 900)) };
    // 2) og:image / og:description de los primeros links de Bing
    const links = items.slice(0, 6).map(x => (x.match(/<link>([^<]+)<\/link>/) || [])[1]?.replace(/&amp;/g, '&')).filter(Boolean);
    out.og = await Promise.all(links.map(async l => {
      const real = (l.match(/[?&]url=([^&]+)/) || [])[1]; const url = real ? decodeURIComponent(real) : l;
      const t0 = Date.now(); const r = await get(url);
      return { url: url.slice(0, 90), status: r.status, ms: Date.now() - t0, img: meta(r.text, 'og:image')?.slice(0, 100), desc: meta(r.text, 'og:description')?.slice(0, 160) };
    }));
    // 3) Fotos de ESPN para los jugadores
    const players = await getActivePlayers(req.headers.host);
    const res2 = await pool(players, 24, async p => (await get(`https://a.espncdn.com/i/headshots/soccer/players/full/${p.id}.png`, { method: 'HEAD' })).status);
    out.headshots = { total: players.length, ok: res2.filter(s => s === 200).length, missing: players.filter((p, i) => res2[i] !== 200).slice(0, 25).map(p => p.n) };
  } catch (e) { out.error = String(e.stack); }
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(out, null, 1));
};
