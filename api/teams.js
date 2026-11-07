// GET /api/teams → todos los equipos de todas las competiciones (para el buscador de favoritos).
const { LEAGUES, espn, send } = require('./_lib');

module.exports = async (req, res) => {
  const idx = new Map(), errors = {};
  await Promise.all(LEAGUES.map(async l => {
    try {
      const data = await espn(`${l.sport}/${l.id}/teams`, 'limit=500');
      (data.sports?.[0]?.leagues?.[0]?.teams || []).forEach(({ team: t }) => {
        const key = `${l.sport}:${t.id}`;
        const cur = idx.get(key) || { key, sport: l.sport, id: String(t.id), name: t.displayName, logo: t.logos?.[0]?.href || '', leagues: [] };
        cur.leagues.push(l.id);
        idx.set(key, cur);
      });
    } catch (e) {
      errors[l.id] = String(e.message || e);
    }
  }));
  send(res, 200, { teams: [...idx.values()], errors }, 86400);
};
