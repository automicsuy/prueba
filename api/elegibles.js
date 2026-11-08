// GET /api/elegibles → todos los uruguayos en actividad (para votar convocados).
// Recorre los planteles de todas las ligas que seguimos más la Liga Uruguaya. Se recalcula 1 vez por semana.
const { LEAGUES, espn, send } = require('./_lib');
const { getSelecciones, levelsFor, pool } = require('./_uru');
const { photoIndex, findPhoto } = require('./_photos');

const SCAN = [...LEAGUES.filter(l => !/u20|sub20|^fifa\.|^conmebol\.(america|sudamericano)|^uefa\.(euro$|euroq|nations)|concacaf\.gold/.test(l.id)),
  { id: 'uru.1', sport: 'soccer', name: 'Liga Uruguaya' }];

module.exports = async (req, res) => {
  const t0 = Date.now();
  try {
    const [sel, photos] = await Promise.all([getSelecciones(req.headers.host), photoIndex().catch(() => null)]);
    // 1) Equipos de cada liga
    const teamLists = await pool(SCAN, 16, async l => {
      const d = await espn(`soccer/${l.id}/teams`, 'limit=500');
      return (d.sports?.[0]?.leagues?.[0]?.teams || []).map(({ team: t }) => ({ league: l.id, id: String(t.id), name: t.displayName, logo: t.logos?.[0]?.href || '' }));
    });
    const teams = new Map();
    teamLists.flat().forEach(t => t?.id && !teams.has(t.id) && teams.set(t.id, t)); // un club una sola vez
    // 2) Planteles
    const players = new Map();
    let errors = 0;
    await pool([...teams.values()], 32, async t => {
      try {
        const d = await espn(`soccer/${t.league}/teams/${t.id}/roster`);
        let a = d.athletes || [];
        if (a[0]?.items) a = a.flatMap(g => g.items || []);
        a.forEach(x => {
          const lv = levelsFor({ id: x.id, fullName: x.fullName, displayName: x.displayName, dateOfBirth: x.dateOfBirth }, sel);
          const uru = x.citizenship === 'Uruguay' || x.citizenshipCountry?.abbreviation === 'URU' || x.flag?.alt === 'Uruguay';
          if (!uru && !lv.mayor && !lv.sub20) return;
          const id = String(x.id);
          if (players.has(id)) return;
          players.set(id, {
            id, n: x.displayName, pos: x.position?.abbreviation || '', age: x.age || null,
            club: t.name, clubLogo: t.logo, lg: t.league,
            photo: (photos && findPhoto(photos, x.displayName, (x.dateOfBirth || '').slice(0, 10))) || '',
            m: lv.mayor ? (sel.stats?.mayor?.[id]?.pj || 1) : 0, s20: lv.sub20 ? 1 : 0,
          });
        });
      } catch { errors++; }
    });
    const list = [...players.values()].sort((a, b) => b.m - a.m || b.s20 - a.s20 || a.n.localeCompare(b.n));
    res.setHeader('cache-control', 'public, max-age=0, s-maxage=604800, stale-while-revalidate=2592000');
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ players: list, teams: teams.size, errors, ms: Date.now() - t0, builtAt: new Date().toISOString() }));
  } catch (e) {
    send(res, 502, { error: String(e.message || e) });
  }
};
