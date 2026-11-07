// Proxy mínimo hacia la API pública de ESPN (evita bloqueos CORS del navegador).
const ALLOWED = /^(soccer|basketball)\/[a-z0-9._]+\/(scoreboard|teams)$/;

module.exports = async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const path = url.searchParams.get('path') || '';
  if (!ALLOWED.test(path)) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: 'path inválido' }));
  }
  url.searchParams.delete('path');
  const target = `https://site.api.espn.com/apis/site/v2/sports/${path}?${url.searchParams}`;
  try {
    const r = await fetch(target, { headers: { 'user-agent': 'Mozilla/5.0', accept: 'application/json' } });
    const body = await r.text();
    res.statusCode = r.status;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    // Caché en el edge de Vercel: 30 s fresco, hasta 5 min sirviendo viejo mientras revalida.
    const ttl = path.endsWith('/teams') ? 86400 : 30;
    res.setHeader('cache-control', `public, s-maxage=${ttl}, stale-while-revalidate=300`);
    res.end(body);
  } catch (e) {
    res.statusCode = 502;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: String(e) }));
  }
};
