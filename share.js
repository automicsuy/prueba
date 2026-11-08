'use strict';
// Tarjeta "Mi oncena" para compartir (historia 9:16 o cuadrada), dibujada en un canvas en el dispositivo.
// Usa FORMATIONS, slotsOf, shortName, initials, sel y showDialog de los otros scripts.

const CARD = { accent: '#5b9fcd', strong: '#2c6f9e', soft: '#e8f2fa', soft2: '#d6e8f5', text: '#0f1d2c', muted: '#6a7888' };
// Nombre como lo dice la hinchada: el apellido (con partículas: "De Arrascaeta", "De la Cruz").
function cardName(n) {
  const w = String(n || '').trim().split(/\s+/);
  if (w.length < 2) return w[0] || '';
  let k = w.length - 1;
  while (k > 1 && /^(de|da|del|la|las|los|van|von|di|dos|das)$/i.test(w[k - 1])) k--;
  const s = w.slice(k).join(' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}
const proxied = url => (url ? `api/img?u=${encodeURIComponent(url)}` : '');

function loadImg(src, ms = 7000) {
  return new Promise(resolve => {
    if (!src) return resolve(null);
    const img = new Image();
    const t = setTimeout(() => resolve(null), ms);
    img.onload = () => { clearTimeout(t); resolve(img); };
    img.onerror = () => { clearTimeout(t); resolve(null); };
    img.src = src;
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function wrap(ctx, text, maxW) {
  const words = String(text).split(/\s+/); const lines = []; let cur = '';
  words.forEach(w => { const t = cur ? `${cur} ${w}` : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; });
  if (cur) lines.push(cur);
  return lines;
}
function fit(ctx, text, maxW) {
  let t = String(text);
  while (t.length > 3 && ctx.measureText(t).width > maxW) t = t.slice(0, -1);
  return t === String(text) ? t : `${t.trimEnd()}…`;
}

// spec: { title, subtitle, formation, players: { slotId: { n, photo, badge? } } }
async function drawCard(spec, format) {
  const story = format === 'story';
  const W = 1080, H = story ? 1920 : 1080;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const font = (w, s) => `${w} ${s}px Geist, system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
  try { await Promise.all([document.fonts.load(font(700, 40)), document.fonts.load(font(500, 40))]); } catch { /* fuente del sistema */ }

  // Fondo
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, CARD.soft); bg.addColorStop(0.45, '#ffffff'); bg.addColorStop(1, CARD.soft);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  // Encabezado: marca
  const pad = story ? 72 : 56;
  const logo = await loadImg('icons/icon.svg');
  const ls = story ? 84 : 64;
  if (logo) ctx.drawImage(logo, pad, pad, ls, ls);
  ctx.fillStyle = CARD.text; ctx.textBaseline = 'alphabetic';
  ctx.font = font(700, story ? 44 : 36); ctx.fillText('Celestes', pad + ls + 22, pad + ls * 0.48);
  ctx.fillStyle = CARD.muted; ctx.font = font(500, story ? 28 : 23); ctx.fillText('La app del hincha celeste', pad + ls + 22, pad + ls * 0.9);

  // Título y subtítulo
  let y = pad + ls + (story ? 110 : 70);
  let ts = story ? 96 : 64;
  ctx.font = font(700, ts);
  const titleMax = W - pad * 2 - (story ? 0 : 200);
  while (ts > 40 && ctx.measureText(spec.title).width > titleMax) { ts -= 4; ctx.font = font(700, ts); }
  ctx.fillStyle = CARD.text;
  ctx.fillText(spec.title, pad, y);
  // Formación (pastilla a la derecha del título en la cuadrada, debajo en la historia)
  ctx.font = font(700, story ? 34 : 28);
  const fw = ctx.measureText(spec.formation).width + (story ? 48 : 40), fh = story ? 60 : 50;
  const fx = story ? pad : W - pad - fw, fy = story ? y + 36 : y - fh + 6;
  ctx.fillStyle = CARD.soft2; roundRect(ctx, fx, fy, fw, fh, fh / 2); ctx.fill();
  ctx.fillStyle = CARD.strong; ctx.fillText(spec.formation, fx + (story ? 24 : 20), fy + fh * 0.68);
  if (story) y = fy + fh;
  if (spec.subtitle) {
    ctx.fillStyle = CARD.muted; ctx.font = font(500, story ? 32 : 26);
    const lines = wrap(ctx, spec.subtitle, W - pad * 2).slice(0, 2);
    lines.forEach((l, i) => ctx.fillText(l, pad, y + (story ? 64 : 46) + i * (story ? 42 : 34)));
    y += (story ? 64 : 46) + (lines.length - 1) * (story ? 42 : 34);
  }

  // Cancha
  const footH = story ? 190 : 96;
  const px = pad - (story ? 12 : 0), pw = W - px * 2;
  const py = y + (story ? 48 : 30), ph = H - py - footH;
  const grad = ctx.createLinearGradient(0, py, 0, py + ph);
  grad.addColorStop(0, '#dcecf7'); grad.addColorStop(1, '#eef6fc');
  ctx.save(); roundRect(ctx, px, py, pw, ph, 36); ctx.clip();
  ctx.fillStyle = grad; ctx.fillRect(px, py, pw, ph);
  ctx.fillStyle = 'rgba(255,255,255,.35)';
  for (let i = 0; i < 8; i += 2) ctx.fillRect(px, py + (ph / 8) * i, pw, ph / 8);
  ctx.strokeStyle = 'rgba(91,159,205,.45)'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(px, py + ph / 2); ctx.lineTo(px + pw, py + ph / 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(px + pw / 2, py + ph / 2, pw * 0.13, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeRect(px + pw * 0.25, py - 4, pw * 0.5, ph * 0.13);
  ctx.strokeRect(px + pw * 0.25, py + ph - ph * 0.13 + 4, pw * 0.5, ph * 0.13);
  ctx.restore();

  // Jugadores
  const rows = FORMATIONS[spec.formation].length;
  const slots = slotsOf(spec.formation);
  const r = story ? 66 : 50;
  const imgs = await Promise.all(slots.map(s => loadImg(proxied(spec.players[s.id]?.photo))));
  slots.forEach((s, k) => {
    const p = spec.players[s.id];
    const cx = px + ((s.i + 1) / (s.n + 1)) * pw;
    const cy = py + (0.9 - (s.row / (rows - 1)) * 0.8) * ph - (story ? 18 : 14);
    ctx.save();
    ctx.shadowColor = 'rgba(15,29,44,.18)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6;
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(cx, cy, r + 6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
    const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r); g.addColorStop(0, CARD.soft); g.addColorStop(1, CARD.soft2);
    ctx.fillStyle = g; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    const img = imgs[k];
    if (img) {
      // Recorte tipo "cover" con el foco arriba (las caras están en el tercio superior).
      const ratio = Math.max((r * 2) / img.width, (r * 2) / img.height);
      const w = img.width * ratio, h = img.height * ratio;
      ctx.drawImage(img, cx - w / 2, cy - r - (h - r * 2) * 0.18, w, h);
    } else {
      ctx.fillStyle = CARD.strong; ctx.font = font(700, r * 0.72); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(p ? initials(p.n) : '?', cx, cy + 2);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }
    ctx.restore();
    // Nombre
    const name = p ? cardName(p.n) : s.label;
    ctx.font = font(700, story ? 30 : 23);
    const maxW = Math.min(pw / s.n - 10, story ? 250 : 200);
    const label = fit(ctx, name, maxW - 24);
    const tw = ctx.measureText(label).width + 24, th = story ? 46 : 36;
    const ty = cy + r + (story ? 14 : 10);
    ctx.save(); ctx.shadowColor = 'rgba(15,29,44,.12)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 2;
    ctx.fillStyle = '#ffffff'; roundRect(ctx, cx - tw / 2, ty, tw, th, 12); ctx.fill(); ctx.restore();
    ctx.fillStyle = CARD.text; ctx.textAlign = 'center'; ctx.fillText(label, cx, ty + th * 0.7);
    if (p?.badge) {
      ctx.font = font(700, story ? 24 : 19);
      const bw = ctx.measureText(p.badge).width + 20, bh = story ? 34 : 28;
      ctx.fillStyle = CARD.strong; roundRect(ctx, cx + r * 0.35, cy - r - 4, bw, bh, bh / 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillText(p.badge, cx + r * 0.35 + bw / 2, cy - r - 4 + bh * 0.72);
    }
    ctx.textAlign = 'left';
  });

  // Pie: invitación
  const host = location.host;
  if (story) {
    ctx.fillStyle = CARD.muted; ctx.font = font(500, 32); ctx.textAlign = 'center';
    ctx.fillText('Armá la tuya en la app del hincha celeste', W / 2, H - 112);
    ctx.fillStyle = CARD.strong; ctx.font = font(700, 36); ctx.fillText(host, W / 2, H - 62);
  } else {
    ctx.fillStyle = CARD.muted; ctx.font = font(500, 24); ctx.textAlign = 'left';
    ctx.fillText('Armá la tuya:', pad, H - 40);
    const lw = ctx.measureText('Armá la tuya: ').width;
    ctx.fillStyle = CARD.strong; ctx.font = font(700, 24); ctx.fillText(host, pad + lw, H - 40);
  }
  ctx.textAlign = 'left';
  return cv;
}

const cardCache = {};
async function cardBlob(spec, format) {
  const key = `${format}:${JSON.stringify(spec)}`;
  if (!cardCache[key]) cardCache[key] = drawCard(spec, format).then(cv => new Promise(res => cv.toBlob(res, 'image/png')));
  return cardCache[key];
}

// Datos para la tarjeta
function myCardSpec() {
  const dr = typeof loadDraft === 'function' ? loadDraft() : sel.draft;
  const players = {};
  Object.entries(dr.lineup).forEach(([slot, id]) => { const p = pinfo(id); players[slot] = { n: p.n, photo: p.photo }; });
  return { title: 'Mi oncena', subtitle: sel.data?.window?.title || 'Selección uruguaya', formation: dr.formation, players };
}

let shareState = null;
async function openShareCard(spec, kind) {
  shareState = { spec, kind, format: 'story', url: null };
  showDialog(`${dlgHead('Compartir')}
    <div class="seg small share-seg" role="group" aria-label="Formato"><button type="button" class="on" data-card-format="story">Historia</button><button type="button" data-card-format="square">Cuadrada</button></div>
    <div class="card-prev" id="cardPrev"><p class="loading-note">Armando la imagen…</p></div>
    <div class="actions share-actions">
      <button type="button" class="btn filled" data-card-action="share">${ic('external')}Compartir</button>
      <button type="button" class="btn" data-card-action="download">Descargar</button>
    </div>`, 'share');
  paintCardPreview();
}
async function paintCardPreview() {
  const st = shareState; if (!st) return;
  const box = $('#cardPrev'); if (!box) return;
  box.classList.toggle('square', st.format === 'square');
  box.innerHTML = '<p class="loading-note">Armando la imagen…</p>';
  const blob = await cardBlob(st.spec, st.format);
  if (shareState !== st || !$('#cardPrev')) return;
  if (st.url) URL.revokeObjectURL(st.url);
  st.url = URL.createObjectURL(blob);
  $('#cardPrev').innerHTML = `<img src="${st.url}" alt="${esc(st.spec.title)}: vista previa de la imagen para compartir">`;
}
async function shareCardNow(download) {
  const st = shareState; if (!st) return;
  const blob = await cardBlob(st.spec, st.format);
  const name = `celestes-${st.kind === 'gente' ? 'oncena-de-la-gente' : 'mi-oncena'}-${st.format === 'story' ? 'historia' : 'cuadrada'}.png`;
  const file = new File([blob], name, { type: 'image/png' });
  const link = `${location.origin}${location.pathname}?tab=sel&vista=votar`;
  const text = st.kind === 'gente' ? `Esta es la oncena que eligió la gente para la Celeste. Votá la tuya en Celestes: ${link}` : `Esta es mi oncena para la Celeste. Armá la tuya en Celestes: ${link}`;
  if (!download && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: st.spec.title, text }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  if (!download) toastMsg('Tu dispositivo no permite compartir directo: descargué la imagen.');
}

function onShareClick(ev) {
  const b = ev.target.closest('[data-card-format], [data-card-action]');
  if (!b || !shareState) return false;
  ev.preventDefault();
  if (b.dataset.cardFormat) {
    shareState.format = b.dataset.cardFormat;
    document.querySelectorAll('.share-seg button').forEach(x => x.classList.toggle('on', x === b));
    paintCardPreview();
  } else shareCardNow(b.dataset.cardAction === 'download');
  return true;
}
