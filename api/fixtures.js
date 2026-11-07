// GET /api/fixtures?teams=eng.1:359,uru.1:2224,...
// Próximos partidos (21 días) de cada equipo en cada competición indicada.
const { LEAGUE_BY_ID, espn, compact, dedupeSort, send, query } = require('./_lib');

module.exports = async (req, res) => {
  const pairs = (query(req).get('teams') || '').split(',').slice(0, 120)
    .map(p => p.split(':')).filter(([lid, id]) => LEAGUE_BY_ID[lid] && /^\d+$/.test(id || ''));
  const events = [], errors = {};
  await Promise.all(pairs.map(async ([lid, id]) => {
    const l = LEAGUE_BY_ID[lid];
    try {
      const data = await espn(`${l.sport}/${l.id}/teams/${id}/schedule`, 'fixture=true');
      (data.events || []).forEach(ev => events.push(compact(ev, l.id)));
    } catch (e) {
      errors[`${lid}:${id}`] = String(e.message || e);
    }
  }));
  const now = Date.now();
  const upcoming = dedupeSort(events).filter(e => {
    const t = Date.parse(e.date);
    return e.state !== 'post' && t >= now - 3 * 3600_000 && t <= now + 21 * 86400_000;
  });
  send(res, 200, { events: upcoming, errors }, 120);
};
