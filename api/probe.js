// TEMPORAL: verificar fuentes de noticias (se elimina antes de producción).
const SITES = ['https://www.ovaciondigital.com.uy', 'https://www.elpais.com.uy', 'https://www.referi.uy', 'https://www.montevideo.com.uy', 'https://www.tenfield.com.uy', 'https://www.auf.org.uy', 'https://www.elobservador.com.uy', 'https://www.subrayado.com.uy', 'https://www.teledoce.com', 'https://ladiaria.com.uy'];
const FEEDS = ['https://news.google.com/rss/search?q=%22Federico%20Valverde%22&hl=es-419&gl=UY&ceid=UY:es-419', 'https://www.tenfield.com.uy/feed/', 'https://www.auf.org.uy/feed/', 'https://www.referi.uy/rss', 'https://www.montevideo.com.uy/anxml.aspx?59', 'https://ladiaria.com.uy/feeds/articulos/', 'https://www.elobservador.com.uy/rss/elobservador.xml'];
async function get(u) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 8000);
  try { const r = await fetch(u, { signal: ctrl.signal, redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 (compatible; MiAgenda/1.0)', accept: 'text/html,application/rss+xml,application/xml,*/*' } }); return { status: r.status, url: r.url, text: await r.text() }; }
  catch (e) { return { status: 0, text: String(e) }; } finally { clearTimeout(t); }
}
module.exports = async (req, res) => {
  const out = { sites: {}, feeds: {} };
  await Promise.all(SITES.map(async s => {
    const r = await get(s);
    const links = [...r.text.matchAll(/<link[^>]+type=["']application\/(?:rss|atom)\+xml["'][^>]*>/gi)].map(m => (m[0].match(/href=["']([^"']+)/) || [])[1]);
    out.sites[s] = { status: r.status, final: r.url, rss: links.slice(0, 5) };
  }));
  await Promise.all(FEEDS.map(async f => {
    const r = await get(f);
    const items = (r.text.match(/<item[\s>]/g) || []).length + (r.text.match(/<entry[\s>]/g) || []).length;
    const firstTitle = (r.text.match(/<item[\s\S]*?<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/) || [])[1];
    out.feeds[f] = { status: r.status, items, firstTitle: firstTitle && firstTitle.slice(0, 120) };
  }));
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(out, null, 1));
};
