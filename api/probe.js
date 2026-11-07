// TEMPORAL: inspección de fuentes de datos (se elimina antes de producción).
module.exports = async (req, res) => {
  const u = new URL(req.url, 'http://x').searchParams.get('u') || '';
  const host = (() => { try { return new URL(u).hostname; } catch { return ''; } })();
  if (!['site.api.espn.com', 'query.wikidata.org', 'site.web.api.espn.com', 'sports.core.api.espn.com'].includes(host)) { res.statusCode = 400; return res.end('host'); }
  const r = await fetch(u, { headers: { 'user-agent': 'MiAgendaDeportiva/1.0 (uso personal)', accept: 'application/json, application/sparql-results+json' } });
  res.statusCode = r.status; res.setHeader('content-type', 'application/json'); res.end(await r.text());
};
