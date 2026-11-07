// GET /api/agenda?from=<ISO>&to=<ISO>&leagues=eng.1,nba,...
// Devuelve los partidos entre "from" y "to" (el día local del usuario) de todas las competiciones pedidas.
const { LEAGUE_BY_ID, send, query, getEvents, parseRange } = require('./_lib');

module.exports = async (req, res) => {
  const q = query(req);
  const range = parseRange(q);
  if (!range) return send(res, 400, { error: 'from/to inválidos' });
  const leagues = (q.get('leagues') || '').split(',').map(id => LEAGUE_BY_ID[id]).filter(Boolean);
  const { events, errors, dates } = await getEvents(range.from, range.to, leagues);
  const live = events.some(e => e.state === 'in');
  send(res, 200, { events, errors, dates, fetchedAt: new Date().toISOString() }, live ? 20 : 60);
};
