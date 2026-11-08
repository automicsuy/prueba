// GET /api/jugadores → jugadores en actividad que jugaron en Uruguay Mayor o Sub-20,
// con sus números en la selección (desde 2010) y en su club esta temporada.
const { send } = require('./_lib');
const { URU_TEAM_ID, URU_U20_TEAM_ID, getSelecciones, pool } = require('./_uru');
const { photoIndex, findPhoto } = require('./_photos');
const { parseGameLog, formIndex } = require('./_form');

const WEB = 'https://site.web.api.espn.com/apis/common/v3/sports/soccer/athletes';
const NATIONAL = new Set([URU_TEAM_ID, URU_U20_TEAM_ID]);

async function web(path) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(`${WEB}/${path}`, { signal: ctrl.signal, headers: { 'user-agent': 'Mozilla/5.0', accept: 'application/json' } });
    if (!r.ok) throw new Error(`ESPN HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

const num = v => (v === undefined || v === null || v === '' ? 0 : Number(v) || 0);

async function player(id) {
  const [info, ov] = await Promise.all([web(id), web(`${id}/overview`)]);
  const a = info.athlete || {};
  const stat = ov.statistics || {};
  const names = stat.names || [];
  const idx = n => names.indexOf(n);
  const splits = (stat.splits || []).map(sp => {
    const v = n => num(sp.stats?.[idx(n)]);
    return {
      name: sp.displayName, team: String(sp.teamId || ''), league: sp.leagueSlug || '',
      tit: v('starts'), g: v('totalGoals'), a: v('goalAssists'), sh: v('totalShots'), sog: v('shotsOnTarget'),
      ta: v('yellowCards'), tr: v('redCards'),
    };
  });
  const clubSplits = splits.filter(sp => !NATIONAL.has(sp.team));
  // Club: el del perfil, salvo que ESPN lo tenga asignado a la selección; en ese caso, el de sus estadísticas.
  const teamNames = {};
  (stat.filters || []).forEach(f => (f.options || []).forEach(o => { teamNames[String(o.value)] = o.displayValue; }));
  let club = a.team && !NATIONAL.has(String(a.team.id)) ? a.team : null;
  if (!club && clubSplits.length) {
    const tid = clubSplits[0].team;
    club = { id: tid, displayName: teamNames[tid] || clubSplits[0].name.replace(/^\S+\s+/, ''), logos: [{ href: `https://a.espncdn.com/i/teamlogos/soccer/500/${tid}.png` }] };
  }
  const ng = ov.nextGame?.league?.events?.[0];
  // En actividad: jugó esta temporada con un club, o tiene club y un próximo partido programado
  // (ESPN no tiene estadísticas de algunas ligas, como la uruguaya). Descarta retirados con perfil viejo.
  if (!club || (!clubSplits.length && !(a.active && ng))) return null;
  const sum = k => clubSplits.reduce((n, sp) => n + sp[k], 0);
  // Forma: últimos partidos de club. El nivel sale de la liga principal del club (no de copas).
  const games = parseGameLog(ov.gameLog);
  const pos = a.position?.abbreviation || '';
  const slug = clubSplits.map(sp => sp.league).find(l => /\.\d$/.test(l)) || clubSplits[0]?.league || '';
  const fi = formIndex(games, ['G', 'D', 'M', 'F'].includes(pos) ? pos : 'M', slug);
  const form = { i: fi.index, r: fi.rodaje, a: fi.aporte, n: fi.nivel, t: fi.trend, off: fi.daysOff, last: games.slice(0, 5) };
  // "22/7/1998" → "1998-07-22"
  const dm = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(a.displayDOB || '');
  const dob = dm ? `${dm[3]}-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}` : '';
  return {
    id,
    n: a.displayName,
    dob,
    espnPhoto: a.headshot?.href || '',
    pos,
    age: a.age || null,
    club: { id: String(club.id), name: club.displayName || club.name, logo: club.logos?.[0]?.href || '' },
    temp: { tit: sum('tit'), g: sum('g'), a: sum('a'), sh: sum('sh'), sog: sum('sog'), ta: sum('ta'), tr: sum('tr') },
    splits: clubSplits.map(({ team, ...rest }) => rest),
    form,
    next: ng ? { date: ng.date, name: ng.name, league: ov.nextGame.league.shortName || ov.nextGame.league.name } : null,
    link: `https://www.espn.com/soccer/player/_/id/${id}`,
  };
}

module.exports = async (req, res) => {
  const t0 = Date.now();
  try {
    const [sel, photos] = await Promise.all([getSelecciones(req.headers.host), photoIndex().catch(() => null)]);
    const ids = [...new Set([...Object.keys(sel.mayor), ...Object.keys(sel.sub20)])];
    const errors = {};
    const out = (await pool(ids, 24, async id => {
      try { return await player(id); } catch (e) { errors[id] = String(e.message || e); return null; }
    })).filter(p => p && !p.error);
    const empty = { pj: 0, tit: 0, g: 0, a: 0, ta: 0, tr: 0, last: '' };
    out.forEach(p => {
      p.photo = (photos && findPhoto(photos, p.n, p.dob)) || p.espnPhoto || '';
      delete p.espnPhoto;
      p.mayor = sel.stats?.mayor?.[p.id] || (sel.mayor[p.id] ? { ...empty } : null);
      p.sub20 = sel.stats?.sub20?.[p.id] || (sel.sub20[p.id] ? { ...empty } : null);
    });
    out.sort((x, y) => (y.mayor?.pj || 0) - (x.mayor?.pj || 0) || (y.sub20?.pj || 0) - (x.sub20?.pj || 0));
    res.setHeader('cache-control', 'public, max-age=0, s-maxage=21600, stale-while-revalidate=604800');
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ players: out, checked: ids.length, errors: Object.keys(errors).length, ms: Date.now() - t0, builtAt: new Date().toISOString() }));
  } catch (e) {
    send(res, 502, { error: String(e.message || e) });
  }
};
