// Outils communs à la bibliothèque, au carnet d'erreurs et à l'examen blanc.
(function () {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const md = s => `<span class="md">${esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>')}</span>`;
  const tono = c => { c = (c || '').toLowerCase(); return /neuro/.test(c) ? 285 : /biolog/.test(c) ? 168 : /drenaje|linf/.test(c) ? 205 : /quir|patolog/.test(c) ? 350 : /ortes|prot/.test(c) ? 32 : 248; };
  const icono = c => { c = (c || '').toLowerCase(); return /neuro/.test(c) ? '🧠' : /biolog/.test(c) ? '🔬' : /drenaje|linf/.test(c) ? '💧' : /quir|patolog/.test(c) ? '🩺' : /ortes|prot/.test(c) ? '🦿' : '📘'; };
  const leer = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch (e) { return d; } };
  const escribir = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } };
  const json = async u => { try { const r = await fetch(u, { cache: 'no-store' }); return r.ok ? await r.json() : []; } catch (e) { return []; } };

  async function ficha(slug) {
    const r = await fetch(`fichas/${slug}.html`, { cache: 'no-store' });
    const m = (await r.text()).match(/<script id="datos" type="application\/json">([\s\S]*?)<\/script>/);
    return JSON.parse(m[1]);
  }
  const claveScore = slug => 'qcm:' + new URL(`fichas/${slug}.html`, location.href).pathname;
  const score = slug => { const u = leer(claveScore(slug), null); return u ? u.r : null; };

  // Carnet d'erreurs : { id: { id, curso, tema, titulo, href, q, n, t } }
  const errores = {
    todos: () => leer('errores', {}),
    lista: () => Object.values(leer('errores', {})).sort((a, b) => (a.curso || '').localeCompare(b.curso || '') || (a.tema ?? 99) - (b.tema ?? 99)),
    anadir(e) { const E = leer('errores', {}); E[e.id] = { ...e, n: (E[e.id]?.n || 0) + 1, t: Date.now() }; escribir('errores', E); },
    quitar(id) { const E = leer('errores', {}); delete E[id]; escribir('errores', E); },
    vaciar() { escribir('errores', {}); },
  };

  // Moteur de QCM. items = [{ id, curso, tema, titulo, href, q:{pregunta,opciones,correcta,explicacion,por_opcion} }]
  // modo 'inmediato' (correction à chaque question) ou 'examen' (correction à la fin, chrono).
  function quiz(el, items, { modo = 'inmediato', segundos = 0, alAcertar, alFallar, alTerminar } = {}) {
    const L = 'ABCD'; let pos = 0; const resp = {}; let fin = false, t0 = Date.now(), reloj = null;
    function tiempo() { if (!segundos) return ''; const r = Math.max(0, segundos - Math.floor((Date.now() - t0) / 1000)); return `⏱ ${String(Math.floor(r / 60)).padStart(2, '0')}:${String(r % 60).padStart(2, '0')}`; }
    function pintar() {
      if (pos >= items.length) return terminar();
      const it = items[pos], q = it.q, r = resp[pos];
      el.innerHTML = `<div class="progreso"><span>${pos + 1} / ${items.length}</span><div class="barra"><i style="width:${(modo === 'examen' ? Object.keys(resp).length : pos) / items.length * 100}%"></i></div><span id="q-reloj">${modo === 'examen' ? tiempo() : Object.values(resp).filter(x => x.ok).length + ' ✓'}</span></div>
        ${it.titulo ? `<a class="origen" href="${esc(it.href || '#')}" ${modo === 'examen' ? 'style="pointer-events:none"' : ''}>${esc(it.curso || '')}${it.tema != null ? ' · Tema ' + esc(it.tema) : ''}</a>` : ''}
        <p class="pregunta">${md(q.pregunta)}</p>
        <div class="opciones">${q.opciones.map((o, i) => `<button class="op ${modo === 'examen' && r?.i === i ? 'elegida' : ''}" data-i="${i}"><span class="l">${L[i]}</span><span>${md(o)}</span><span class="ex">${md(q.por_opcion?.[i] || '')}</span></button>`).join('')}</div>
        <div class="explic">${md(q.explicacion || '')}</div>
        <div class="acciones"><button class="bot sec" id="q-atras" ${pos === 0 ? 'disabled' : ''}>Anterior</button>
        ${modo === 'examen' ? `<span><button class="bot sec" id="q-fin">Terminer l’examen</button> <button class="bot" id="q-sig">${pos === items.length - 1 ? 'Dernière question' : 'Siguiente →'}</button></span>` : `<button class="bot" id="q-sig" ${r ? '' : 'disabled'}>${pos === items.length - 1 ? 'Ver resultado' : 'Siguiente →'}</button>`}</div>`;
      el.querySelectorAll('.op').forEach(b => b.onclick = () => elegir(+b.dataset.i));
      el.querySelector('#q-atras').onclick = () => { pos--; pintar(); };
      el.querySelector('#q-sig').onclick = () => { if (modo === 'examen' && pos === items.length - 1) return; pos++; pintar(); el.scrollIntoView({ block: 'start' }); };
      const f = el.querySelector('#q-fin'); if (f) f.onclick = () => { if (Object.keys(resp).length === items.length || confirm(`Il reste ${items.length - Object.keys(resp).length} question(s) sans réponse. Terminer quand même ?`)) terminar(); };
      if (modo === 'inmediato' && r) marcar();
    }
    function elegir(i) {
      const it = items[pos];
      if (modo === 'examen') { resp[pos] = { i, ok: i === it.q.correcta }; pintar(); return; }
      if (resp[pos]) return;
      resp[pos] = { i, ok: i === it.q.correcta };
      (resp[pos].ok ? alAcertar : alFallar)?.(it);
      marcar(); el.querySelector('#q-sig').disabled = false;
    }
    function marcar() {
      const q = items[pos].q, r = resp[pos];
      el.querySelectorAll('.op').forEach(b => { const i = +b.dataset.i; b.disabled = true; b.classList.add('visto'); if (i === q.correcta) b.classList.add('bien'); else if (i === r.i) b.classList.add('mal'); });
      el.querySelector('.explic').classList.add('ver');
      el.querySelector('.barra i').style.width = ((pos + 1) / items.length * 100) + '%';
      el.querySelector('#q-reloj').textContent = Object.values(resp).filter(x => x.ok).length + ' ✓';
    }
    function terminar() {
      if (fin) return; fin = true; clearInterval(reloj);
      const res = items.map((it, k) => ({ it, r: resp[k] || null, ok: !!resp[k]?.ok }));
      if (modo === 'examen') res.forEach(x => (x.ok ? alAcertar : alFallar)?.(x.it));
      alTerminar?.(res, Math.floor((Date.now() - t0) / 1000));
    }
    if (modo === 'examen' && segundos) reloj = setInterval(() => { const e = el.querySelector('#q-reloj'); if (e) e.textContent = tiempo(); if (Date.now() - t0 >= segundos * 1000) terminar(); }, 1000);
    pintar();
  }

  const barajar = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const itemsDeFicha = (slug, f) => (f.qcm || []).map((q, i) => ({ id: `${slug}#${i}`, curso: f.asignatura, tema: f.tema, titulo: f.titulo, href: `fichas/${slug}.html`, q }));

  window.FI = { esc, md, tono, icono, leer, escribir, json, ficha, score, claveScore, errores, quiz, barajar, itemsDeFicha };
})();
