// GET /api/uruguayos?from=<ISO>&to=<ISO>
// Partidos del día con jugadores uruguayos en el plantel (excepto Liga Uruguaya) y partidos de las selecciones de Uruguay.
const { LEAGUES, espn, send, query, getEvents, parseRange } = require('./_lib');
const { URU_TEAM_ID, URU_U20_TEAM_ID, getSelecciones, levelsFor, pool } = require('./_uru');

const SCAN = LEAGUES.filter(l => l.id !== 'uru.1');
const NATIONAL_GROUPS = new Set(['Selecciones']);
const isNationalComp = l => NATIONAL_GROUPS.has(l.group) || l.id === 'fiba' || /u20|sub20/.test(l.id);
const URU_IDS = new Set([URU_TEAM_ID, URU_U20_TEAM_ID]);

const rosterCache = new Map(); // "sport/league/team" -> {t, athletes}
async function roster(l, teamId) {
  const key = `${l.sport}/${l.id}/${teamId}`;
  const hit = rosterCache.get(key);
  if (hit && Date.now() - hit.t < 12 * 3600_000) return hit.athletes;
  const data = await espn(`${l.sport}/${l.id}/teams/${teamId}/roster`);
  let athletes = data.athletes || [];
  if (athletes[0]?.items) athletes = athletes.flatMap(g => g.items || []);
  athletes = athletes.map(a => ({
    id: String(a.id),
    name: a.displayName || a.fullName,
    fullName: a.fullName || a.displayName,
    dateOfBirth: a.dateOfBirth || '',
    pos: a.position?.abbreviation || '',
    uru: a.citizenship === 'Uruguay' || a.citizenshipCountry?.abbreviation === 'URU' || a.birthPlace?.country === 'Uruguay' || a.flag?.alt === 'Uruguay',
  }));
  rosterCache.set(key, { t: Date.now(), athletes });
  return athletes;
}

module.exports = async (req, res) => {
  const range = parseRange(query(req));
  if (!range) return send(res, 400, { error: 'from/to inválidos' });

  const [{ events, errors }, sel] = await Promise.all([
    getEvents(range.from, range.to, SCAN),
    getSelecciones(req.headers.host).catch(e => { console.error('selecciones', e); return { mayor: {}, sub20: {}, wd: {} }; }),
  ]);
  const byLeague = Object.fromEntries(SCAN.map(l => [l.id, l]));

  const seleccion = {}; // eventId -> 'mayor' | 'sub20'
  const jobs = new Map(); // "league:team" -> {l, teamId}
  for (const e of events) {
    const l = byLeague[e.league];
    if (URU_IDS.has(e.home.id) || URU_IDS.has(e.away.id)) {
      seleccion[e.id] = (e.home.id === URU_U20_TEAM_ID || e.away.id === URU_U20_TEAM_ID) ? 'sub20' : 'mayor';
      continue;
    }
    if (isNationalComp(l)) continue; // en otras selecciones no hay uruguayos
    for (const t of [e.home, e.away]) if (t.id) jobs.set(`${l.id}:${t.id}`, { l, teamId: t.id });
  }

  const found = {}; // "league:team" -> [jugadores]
  await pool([...jobs.entries()], 16, async ([key, { l, teamId }]) => {
    try {
      const athletes = await roster(l, teamId);
      found[key] = athletes.flatMap(a => {
        const lv = l.sport === 'soccer' ? levelsFor(a, sel) : { mayor: false, sub20: false };
        if (!a.uru && !lv.mayor && !lv.sub20) return [];
        return [{ id: a.id, n: a.name, p: a.pos, m: lv.mayor, s20: lv.sub20 }];
      });
    } catch (err) {
      errors[`roster:${key}`] = String(err.message || err);
    }
  });

  const rank = p => (p.m ? 0 : p.s20 ? 1 : 2);
  const players = {};
  const out = [];
  for (const e of events) {
    if (seleccion[e.id]) { out.push(e); continue; }
    const list = ['home', 'away'].flatMap(side => (found[`${e.league}:${e[side].id}`] || []).map(p => ({ ...p, side })));
    if (!list.length) continue;
    list.sort((a, b) => rank(a) - rank(b) || a.n.localeCompare(b.n));
    players[e.id] = list;
    out.push(e);
  }

  const live = out.some(e => e.state === 'in');
  send(res, 200, { events: out, players, seleccion, errors, fetchedAt: new Date().toISOString() }, live ? 60 : 300);
};
