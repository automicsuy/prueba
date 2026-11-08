// GET /api/videos?player=<id>  → videos recientes de un jugador (goles, resúmenes, shorts)
// GET /api/videos              → videos recientes de la selección uruguaya
// Usa la API de YouTube (variable de entorno YOUTUBE_API_KEY). Cada búsqueda gasta 100 de las
// 10.000 unidades diarias gratuitas, por eso los resultados se guardan 12 h en el edge.
const { send, query } = require('./_lib');
const { getActivePlayers } = require('./_players');

const YT = 'https://www.googleapis.com/youtube/v3';
const KEY = () => process.env.YOUTUBE_API_KEY;

async function yt(path, params) {
  const url = `${YT}/${path}?${new URLSearchParams({ ...params, key: KEY() })}`;
  const r = await fetch(url, { headers: { accept: 'application/json' } });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error?.message || `YouTube HTTP ${r.status}`);
  return body;
}

// "PT1M5S" → 65
const seconds = iso => { const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || '') || []; return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0); };
const decode = s => String(s || '').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');

async function search(q, days) {
  const s = await yt('search', {
    part: 'snippet', q, type: 'video', order: 'date', maxResults: '20', relevanceLanguage: 'es',
    publishedAfter: new Date(Date.now() - days * 86400_000).toISOString(), videoEmbeddable: 'true',
  });
  const ids = (s.items || []).map(i => i.id.videoId).filter(Boolean);
  if (!ids.length) return [];
  const d = await yt('videos', { part: 'contentDetails,statistics', id: ids.join(',') }); // 1 unidad
  const info = Object.fromEntries((d.items || []).map(v => [v.id, v]));
  return (s.items || []).filter(i => info[i.id.videoId]).map(i => {
    const v = info[i.id.videoId];
    const secs = seconds(v.contentDetails?.duration);
    const title = decode(i.snippet.title);
    const short = secs <= 60 || /#shorts?\b/i.test(title + ' ' + (i.snippet.description || ''));
    const kind = short ? 'short' : /\bgol(es|azo)?\b|\bgoal/i.test(title) ? 'gol' : /resumen|highlights|compacto/i.test(title) ? 'resumen' : secs <= 600 ? 'clip' : 'largo';
    return {
      id: i.id.videoId, t: title, ch: decode(i.snippet.channelTitle), date: i.snippet.publishedAt,
      thumb: i.snippet.thumbnails?.medium?.url || i.snippet.thumbnails?.default?.url || '',
      secs, kind, views: +v.statistics?.viewCount || 0,
    };
  });
}

module.exports = async (req, res) => {
  if (!KEY()) return send(res, 200, { error: 'no_key' });
  try {
    const pid = query(req).get('player');
    let videos;
    if (pid) {
      const p = (await getActivePlayers(req.headers.host)).find(x => x.id === pid);
      if (!p) return send(res, 404, { error: 'jugador desconocido' });
      videos = await search(`"${p.n}"`, 45);
    } else {
      const [a, b] = await Promise.all([search('selección uruguaya', 14), search('Uruguay gol uruguayo', 7)]);
      const seen = new Set();
      videos = [...a, ...b].filter(v => (seen.has(v.id) ? false : seen.add(v.id))).sort((x, y) => y.date.localeCompare(x.date));
    }
    res.setHeader('cache-control', 'public, max-age=0, s-maxage=43200, stale-while-revalidate=86400');
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ videos, builtAt: new Date().toISOString() }));
  } catch (e) {
    send(res, 502, { error: String(e.message || e) });
  }
};
