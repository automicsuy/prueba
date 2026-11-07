// Utilidades compartidas por las funciones de /api (los archivos con "_" no son endpoints).
const LEAGUES = require('../leagues.js');
const LEAGUE_BY_ID = Object.fromEntries(LEAGUES.map(l => [l.id, l]));
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports';

async function espn(path, qs = '', timeoutMs = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${ESPN}/${path}${qs ? '?' + qs : ''}`, {
      signal: ctrl.signal,
      headers: { 'user-agent': 'Mozilla/5.0', accept: 'application/json' },
    });
    if (!r.ok) throw new Error(`ESPN HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

// El "día" de ESPN va de ~07:00/08:00 UTC a la misma hora del día siguiente.
function espnDatesBetween(fromMs, toMs) {
  const set = new Set();
  for (let t = fromMs; t <= toMs + 3600_000; t += 3600_000) {
    for (const off of [7, 8]) set.add(new Date(t - off * 3600_000).toISOString().slice(0, 10).replace(/-/g, ''));
  }
  return [...set].sort();
}

// Evento compacto (ESPN manda ~15 KB por partido con cuotas, estadísticas, etc.)
function compact(ev, leagueId) {
  const comp = ev.competitions?.[0] || {};
  const side = ha => {
    const c = (comp.competitors || []).find(x => x.homeAway === ha) || {};
    const t = c.team || {};
    const score = c.score && typeof c.score === 'object' ? c.score.displayValue : c.score;
    return {
      id: String(t.id ?? ''),
      name: t.displayName || t.name || '—',
      short: (t.shortDisplayName || t.abbreviation || t.displayName || '—').trim(),
      logo: t.logo || t.logos?.[0]?.href || '',
      score: score ?? '',
      winner: !!c.winner,
    };
  };
  const status = ev.status || comp.status || {};
  const st = status.type || {};
  const tv = new Set();
  (comp.broadcasts || []).forEach(b => (b.names || []).forEach(n => tv.add(n)));
  (comp.geoBroadcasts || []).forEach(b => b.media?.shortName && tv.add(b.media.shortName));
  return {
    id: String(ev.id),
    league: leagueId,
    date: ev.date,
    state: st.state || 'pre',
    statusName: st.name || '',
    detail: st.shortDetail || st.detail || '',
    clock: status.displayClock || '',
    home: side('home'),
    away: side('away'),
    venue: comp.venue?.fullName || '',
    city: comp.venue?.address?.city || '',
    round: comp.notes?.[0]?.headline || '',
    tv: [...tv],
    link: (ev.links || []).find(l => (l.rel || []).includes('summary'))?.href || '',
  };
}

function dedupeSort(list) {
  const seen = new Set();
  return list.filter(e => (seen.has(e.id) ? false : seen.add(e.id))).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
}

function send(res, status, body, sMaxAge = 30) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', status === 200 ? `public, max-age=0, s-maxage=${sMaxAge}, stale-while-revalidate=300` : 'no-store');
  res.end(JSON.stringify(body));
}

const query = req => new URL(req.url, 'http://x').searchParams;

// Partidos entre dos instantes (ms) para una lista de competiciones.
async function getEvents(from, to, leagues) {
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
  return { events: inRange, errors, dates };
}

function parseRange(q) {
  const from = Date.parse(q.get('from')), to = Date.parse(q.get('to'));
  if (!from || !to || to < from || to - from > 3 * 86400_000) return null;
  return { from, to };
}

module.exports = { LEAGUES, LEAGUE_BY_ID, espn, espnDatesBetween, compact, dedupeSort, send, query, getEvents, parseRange };
