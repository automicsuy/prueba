// GET /api/selecciones → jugadores que jugaron en Uruguay Mayor / Sub-20 (se recalcula como mucho 1 vez por semana).
const { send } = require('./_lib');
const { buildSelecciones } = require('./_uru');

module.exports = async (req, res) => {
  try {
    const s = await buildSelecciones();
    res.setHeader('cache-control', 'public, max-age=0, s-maxage=604800, stale-while-revalidate=2592000');
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(s));
  } catch (e) {
    send(res, 502, { error: String(e.message || e) });
  }
};
