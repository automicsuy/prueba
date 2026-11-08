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
      if (r.ok) list = (await r.json()).players?.map(p => ({ id: p.id, n: p.n, club: p.club?.name || '', mayor: !!p.mayor, last: p.mayor?.last || p.sub20?.last || '' }));
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

// Arma un "matcher" que dice qué jugadores se mencionan en un texto:
// nombre completo, o apellido si es distintivo (≥5 letras y único entre los jugadores).
function playerMatcher(players) {
  const lastCount = {};
  const lastOf = p => norm(p.n).split(/\s+/).pop();
  players.forEach(p => { const l = lastOf(p); lastCount[l] = (lastCount[l] || 0) + 1; });
  const rules = players.map(p => {
    const full = norm(p.n);
    const last = lastOf(p);
    const pats = [full];
    if (last.length >= 5 && lastCount[last] === 1) pats.push(last);
    return { id: p.id, re: new RegExp(`\\b(${pats.map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`) };
  });
  return text => {
    const t = norm(text);
    return rules.filter(r => r.re.test(t)).map(r => r.id);
  };
}

module.exports = { getActivePlayers, playerMatcher, norm };
