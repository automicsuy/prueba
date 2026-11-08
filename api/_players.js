// Lista de jugadores de la selección en actividad (id, nombre, club), para noticias y videos.
// Usa /api/jugadores (cacheado en el edge); si no está disponible, cae a los que jugaron en la selección desde 2023.
const { getSelecciones } = require('./_uru');

let cache = null;
async function getActivePlayers(host) {
  if (cache && Date.now() - cache.t < 6 * 3600_000) return cache.list;
  let list = null;
  if (host) {
    try {
      const r = await fetch(`https://${host}/api/jugadores`, { headers: { accept: 'application/json' } });
      if (r.ok) list = (await r.json()).players?.map(p => ({ id: p.id, n: p.n, club: p.club?.name || '', photo: p.photo || '', mayor: !!p.mayor, last: p.mayor?.last || p.sub20?.last || '' }));
    } catch { /* fallback */ }
  }
  if (!list?.length) {
    const sel = await getSelecciones(host);
    const ids = new Set([...Object.keys(sel.mayor), ...Object.keys(sel.sub20)]);
    list = [...ids].map(id => {
      const st = sel.stats?.mayor?.[id] || sel.stats?.sub20?.[id] || {};
      return { id, n: sel.mayor[id] || sel.sub20[id], club: '', mayor: !!sel.mayor[id], last: st.last || '' };
    }).filter(p => p.last >= '2023');
  }
  cache = { t: Date.now(), list };
  return list;
}

const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Apellidos muy comunes: con ellos hay homónimos (p. ej. el Luis Suárez colombiano o el "Dibu" Emiliano Martínez).
const COMMON = new Set(('rodriguez martinez gonzalez garcia perez fernandez lopez sanchez gomez diaz suarez romero silva alvarez '
  + 'torres ramirez flores acosta benitez castro sosa ruiz hernandez morales vazquez pereira rojas gimenez nunez cabrera medina '
  + 'herrera aguirre mendez viera santos dominguez gutierrez rios vega molina ortiz delgado ramos moreno jimenez blanco').split(' '));
const UY_CONTEXT = /\b(uruguay|uruguayo|uruguaya|uruguayos|celeste|charrua|bielsa)\b/;
const GENERIC_CLUB_WORDS = new Set(['club', 'deportivo', 'atletico', 'sporting', 'united', 'city', 'real', 'fc', 'cf', 'sc', 'ac', 'de', 'del', 'la', 'el', 'los', 'futbol', 'football']);
const escRe = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Arma un "matcher" que dice qué jugadores se mencionan en un texto:
// - nombre completo; si el apellido es común, además tiene que aparecer su club o una referencia uruguaya;
// - apellido solo, únicamente si es distintivo (≥5 letras, no común y único entre los jugadores).
function playerMatcher(players) {
  const lastCount = {};
  const lastOf = p => norm(p.n).split(/\s+/).pop();
  players.forEach(p => { const l = lastOf(p); lastCount[l] = (lastCount[l] || 0) + 1; });
  const rules = players.map(p => {
    const full = norm(p.n);
    const last = lastOf(p);
    const common = COMMON.has(last);
    const pats = [full];
    if (!common && last.length >= 5 && lastCount[last] === 1) pats.push(last);
    const clubWords = norm(p.club).split(/[^a-z0-9]+/).filter(w => w.length >= 4 && !GENERIC_CLUB_WORDS.has(w));
    return {
      id: p.id,
      re: new RegExp(`\\b(${pats.map(escRe).join('|')})\\b`),
      ctx: common ? new RegExp(`\\b(${clubWords.map(escRe).join('|') || 'zzzz'})\\b`) : null,
    };
  });
  return text => {
    const t = norm(text);
    return rules.filter(r => r.re.test(t) && (!r.ctx || r.ctx.test(t) || UY_CONTEXT.test(t))).map(r => r.id);
  };
}

module.exports = { getActivePlayers, playerMatcher, norm };
