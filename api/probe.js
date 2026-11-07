// TEMPORAL: inspección de estructuras de ESPN (se elimina antes de producción).
const trim = (o, n = 2500) => JSON.stringify(o).slice(0, n);
async function get(u) {
  const r = await fetch(u, { headers: { 'user-agent': 'Mozilla/5.0', accept: 'application/json' } });
  return { status: r.status, body: r.ok ? await r.json() : await r.text() };
}
module.exports = async (req, res) => {
  const out = {};
  const sch = await get('https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.worldq.conmebol/teams/212/schedule?season=2025');
  const ev = (sch.body.events || []).find(e => e.competitions?.[0]?.status?.type?.state === 'post');
  out.event = ev && { id: ev.id, date: ev.date };
  if (ev) {
    const s = await get(`https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.worldq.conmebol/summary?event=${ev.id}`);
    const t = (s.body.rosters || []).find(r => String(r.team?.id) === '212');
    out.rosterKeys = t && Object.keys(t);
    out.rosterEntry = t && trim(t.roster.find(p => p.starter), 3000);
  }
  for (const u of [
    'https://site.web.api.espn.com/apis/common/v3/sports/soccer/athletes/235818',
    'https://site.web.api.espn.com/apis/common/v3/sports/soccer/athletes/235818/overview',
    'https://site.web.api.espn.com/apis/common/v3/sports/soccer/athletes/235818/stats',
    'https://sports.core.api.espn.com/v2/sports/soccer/athletes/235818',
  ]) {
    const r = await get(u);
    out[u.replace(/^https:\/\/[^/]+/, '')] = { status: r.status, keys: typeof r.body === 'object' ? Object.keys(r.body) : null, sample: trim(r.body, 3500) };
  }
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(out, null, 1));
};
