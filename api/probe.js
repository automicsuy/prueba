// TEMPORAL: verificación de fuentes de datos (se elimina antes de producción).
const { espn } = require('./_lib');
const { buildSelecciones, URU_TEAM_ID } = require('./_uru');

const CANDIDATE_LEAGUES = ['bra.1', 'bra.copa_do_brazil', 'mex.1', 'por.1', 'esp.2', 'eng.2', 'ita.2', 'fra.1', 'ger.1', 'chi.1', 'par.1', 'ecu.1', 'col.1', 'per.1', 'bol.1', 'ven.1', 'tur.1', 'gre.1', 'arg.copa', 'ksa.1'];
const U20_CANDIDATES = ['fifa.world.u20', 'conmebol.sudamericano_sub20', 'conmebol.u20', 'conmebol.sub20', 'fifa.u20.world'];

module.exports = async (req, res) => {
  const mode = new URL(req.url, 'http://x').searchParams.get('mode');
  let out = {};
  if (mode === 'leagues') {
    for (const l of CANDIDATE_LEAGUES) {
      try { const d = await espn(`soccer/${l}/scoreboard`); out[l] = `ok ${d.leagues?.[0]?.name} (${(d.events || []).length} ev)`; } catch (e) { out[l] = String(e.message); }
    }
    for (const l of U20_CANDIDATES) {
      try { const d = await espn(`soccer/${l}/teams/${URU_TEAM_ID}/schedule`, 'season=2025'); out['u20:' + l] = `ok ${(d.events || []).length} ev`; } catch (e) { out['u20:' + l] = String(e.message); }
    }
  } else if (mode === 'sel') {
    const s = await buildSelecciones();
    out = { ms: s.ms, stats: s.stats, valverde: s.mayor['235818'] || null, sampleMayor: Object.values(s.mayor).slice(0, 40), sampleSub20: Object.values(s.sub20).slice(0, 30) };
  }
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(out));
};
