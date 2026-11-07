// Índice de jugadores que jugaron en la selección uruguaya (Mayor y Sub-20).
// Fuente principal: alineaciones de ESPN de cada partido de Uruguay (IDs exactos de jugador).
// Complemento: Wikidata (nombre + fecha de nacimiento) para jugadores anteriores a la cobertura de ESPN.
const { espn } = require('./_lib');

const URU_TEAM_ID = '212';      // Selección mayor en ESPN
const URU_U20_TEAM_ID = '7345';  // Sub-20 en ESPN
const MAYOR_LEAGUES = ['fifa.world', 'fifa.worldq.conmebol', 'conmebol.america', 'fifa.friendly'];
const SUB20_LEAGUES = ['fifa.world.u20', 'conmebol.sudamericano_sub20'];
const FIRST_SEASON = 2010;

async function pool(items, size, fn) {
  const out = [];
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]).catch(e => ({ error: String(e.message || e) })); }
  }));
  return out;
}

// Partidos jugados por Uruguay en una lista de competiciones.
async function uruEvents(leagues, teamId) {
  const seasons = [];
  for (let y = FIRST_SEASON; y <= new Date().getFullYear(); y++) seasons.push(y);
  const jobs = leagues.flatMap(l => seasons.map(y => ({ l, y })));
  const res = await pool(jobs, 12, async ({ l, y }) => {
    const data = await espn(`soccer/${l}/teams/${teamId}/schedule`, `season=${y}`);
    return (data.events || [])
      .filter(e => (e.competitions?.[0]?.status?.type?.state || e.status?.type?.state) === 'post')
      .map(e => ({ id: String(e.id), league: l }));
  });
  const seen = new Map();
  res.flat().forEach(e => e && e.id && seen.set(e.id, e));
  return [...seen.values()];
}

// Jugadores de Uruguay que entraron a la cancha (titulares o suplentes que ingresaron).
async function uruPlayers(events, teamId) {
  const players = new Map();
  let ok = 0;
  await pool(events, 12, async ({ id, league }) => {
    const data = await espn(`soccer/${league}/summary`, `event=${id}`);
    const team = (data.rosters || []).find(r => String(r.team?.id) === teamId);
    if (!team) return;
    ok++;
    (team.roster || []).forEach(p => {
      const played = p.starter || p.subbedIn === true || p.subbedIn?.didSub === true;
      if (!played || !p.athlete?.id) return;
      players.set(String(p.athlete.id), p.athlete.displayName);
    });
  });
  return { players, eventsWithLineup: ok };
}

const WD_TEAMS = { Q134916: 'mayor', Q2442864: 'sub20' };
async function wikidataPlayers() {
  const q = `SELECT ?team ?nameEs ?nameEn ?dob WHERE { VALUES ?team {wd:Q134916 wd:Q2442864} ?p wdt:P54 ?team ; wdt:P569 ?dob . FILTER(YEAR(?dob) >= 1980) OPTIONAL{?p rdfs:label ?nameEs FILTER(LANG(?nameEs)="es")} OPTIONAL{?p rdfs:label ?nameEn FILTER(LANG(?nameEn)="en")} }`;
  const r = await fetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(q)}`, {
    headers: { 'user-agent': 'MiAgendaDeportiva/1.0 (uso personal)', accept: 'application/sparql-results+json' },
  });
  if (!r.ok) throw new Error(`Wikidata HTTP ${r.status}`);
  const rows = (await r.json()).results.bindings;
  // clave: fecha de nacimiento → [{name, level}]
  const byDob = {};
  rows.forEach(b => {
    const dob = b.dob.value.slice(0, 10);
    const level = WD_TEAMS[b.team.value.split('/').pop()];
    const name = b.nameEs?.value || b.nameEn?.value || '';
    (byDob[dob] ||= []).push({ name, level });
  });
  return byDob;
}

async function buildSelecciones() {
  const t0 = Date.now();
  const [mayorEv, sub20Ev, wd] = await Promise.all([
    uruEvents(MAYOR_LEAGUES, URU_TEAM_ID),
    uruEvents(SUB20_LEAGUES, URU_U20_TEAM_ID),
    wikidataPlayers().catch(() => ({})),
  ]);
  const [mayor, sub20] = await Promise.all([uruPlayers(mayorEv, URU_TEAM_ID), uruPlayers(sub20Ev, URU_U20_TEAM_ID)]);
  return {
    builtAt: new Date().toISOString(),
    ms: Date.now() - t0,
    stats: { mayorEvents: mayorEv.length, mayorLineups: mayor.eventsWithLineup, mayorPlayers: mayor.players.size, sub20Events: sub20Ev.length, sub20Lineups: sub20.eventsWithLineup, sub20Players: sub20.players.size, wikidataDates: Object.keys(wd).length },
    mayor: Object.fromEntries(mayor.players),
    sub20: Object.fromEntries(sub20.players),
    wd,
  };
}

// Normaliza nombres para comparar ("Matías Viña" ≈ "Matias Vina").
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter(Boolean);

// ¿En qué selecciones jugó este atleta de ESPN? → {mayor, sub20}
function levelsFor(athlete, sel) {
  const id = String(athlete.id);
  const out = { mayor: !!sel.mayor[id], sub20: !!sel.sub20[id] };
  const dob = (athlete.dateOfBirth || '').slice(0, 10);
  const cands = dob && sel.wd[dob];
  if (cands) {
    const mine = new Set(norm(athlete.fullName || athlete.displayName));
    for (const c of cands) {
      if (norm(c.name).some(tok => tok.length > 2 && mine.has(tok))) out[c.level] = true;
    }
  }
  return out;
}

module.exports = { URU_TEAM_ID, buildSelecciones, levelsFor, pool };
