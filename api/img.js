// GET /api/img?u=<url> → reenvía fotos de Wikimedia y escudos de ESPN desde el mismo origen,
// para poder dibujarlas en la tarjeta "Mi oncena" (un canvas no acepta imágenes de otro origen sin CORS).
const ALLOWED = /^(commons\.wikimedia\.org|upload\.wikimedia\.org|a\.espncdn\.com|[a-z0-9-]+\.espncdn\.com)$/;
const MAX = 3 * 1024 * 1024;

module.exports = async (req, res) => {
  let url;
  try { url = new URL(new URL(req.url, 'http://x').searchParams.get('u') || ''); } catch { url = null; }
  if (!url || url.protocol !== 'https:' || !ALLOWED.test(url.hostname)) { res.statusCode = 400; return res.end('URL no permitida'); }
  try {
    let r = await fetch(url, { headers: { 'user-agent': 'CelestesApp/1.0 (app del hincha celeste)' }, redirect: 'manual', signal: AbortSignal.timeout(8000) });
    // Sigue redirecciones solo hacia hosts permitidos (Special:FilePath → upload.wikimedia.org).
    for (let i = 0; i < 3 && r.status >= 300 && r.status < 400; i++) {
      const next = new URL(r.headers.get('location'), url);
      if (next.protocol !== 'https:' || !ALLOWED.test(next.hostname)) throw new Error('redirección no permitida');
      url = next;
      r = await fetch(url, { headers: { 'user-agent': 'CelestesApp/1.0 (app del hincha celeste)' }, redirect: 'manual', signal: AbortSignal.timeout(8000) });
    }
    const type = r.headers.get('content-type') || '';
    if (!r.ok || !/^image\//.test(type) || /svg/.test(type)) throw new Error(`respuesta ${r.status} ${type}`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > MAX) throw new Error('imagen demasiado grande');
    res.statusCode = 200;
    res.setHeader('content-type', type);
    res.setHeader('cache-control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000');
    res.setHeader('x-content-type-options', 'nosniff');
    res.end(buf);
  } catch (e) {
    res.statusCode = 502;
    res.setHeader('cache-control', 'public, s-maxage=600');
    res.end(String(e.message || e));
  }
};
