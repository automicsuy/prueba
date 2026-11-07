// GET /api/agenda?from=<ISO>&to=<ISO>&leagues=eng.1,nba,...
// Devuelve los partidos entre "from" y "to" (el día local del usuario) de todas las competiciones pedidas.
const { LEAGUE_BY_ID, espn, espnDatesBetween, compact, dedupeSort, send, query } = require('./_lib');

module.exports = async (req, res) => {
  const q = query(req);
  const from = Date.parse(q.get('from')), to = Date.parse(q.get('to'));
  if (!from || !to || to < from || to - from > 3 * 86400_000) return send(res, 400, { error: 'from/to inválidos' });
  const leagues = (q.get('leagues') || '').split(',').map(id => LEAGUE_BY_ID[id]).filter(Boolean);
  const dates = espnDatesBetween(from, to);
  const events = [], errors = {};
  await Promise.all(leagues.flatMap(l => dates.map(async d => {
    try {
      const data = await espn(`${l.sport}/${l.id}/scoreboard`, `dates=${d}&limit=200`);
      (data.events || []).forEach(ev => events.push(compact(ev, l.id)));
    } catch (e) {
      errors[l.id] = String(e.message || e);
    }
  })));
  const inRange = dedupeSort(events).filter(e => { const t = Date.parse(e.date); return t >= from && t <= to; });
  const live = inRange.some(e => e.state === 'in');
  send(res, 200, { events: inRange, errors, dates, fetchedAt: new Date().toISOString() }, live ? 20 : 60);
};
