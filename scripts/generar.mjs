// Genera las fichas a partir de la base de Notion « Dépôt des cours ».
// Node 20+, sin dependencias. Variables: NOTION_TOKEN, ANTHROPIC_API_KEY, NOTION_DB_ID, SITE_URL, MODEL (opcional).
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const { NOTION_TOKEN, ANTHROPIC_API_KEY, NOTION_DB_ID } = process.env;
const SITE_URL = (process.env.SITE_URL || '').replace(/\/?$/, '/');
const MODEL = process.env.MODEL || 'claude-sonnet-5-5';
const MAX_POR_EJECUCION = Number(process.env.MAX_POR_EJECUCION || 3);
const DEMO = process.argv.includes('--demo'); // renderiza data/demo.json sin llamar a ninguna API

const NOTION = 'https://api.notion.com/v1';
const nh = { 'Authorization': `Bearer ${NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' };

async function notion(method, url, body) {
  const r = await fetch(NOTION + url, { method, headers: nh, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error(`Notion ${method} ${url} → ${r.status} ${await r.text()}`);
  return r.json();
}
const plain = (rt = []) => rt.map(t => t.plain_text).join('');

async function setEstado(pageId, estado, extra = {}) {
  const properties = { 'Statut': { status: { name: estado } } };
  if (extra.fiche) properties['Fiche'] = { url: extra.fiche };
  properties['Message'] = { rich_text: extra.message ? [{ text: { content: extra.message.slice(0, 1900) } }] : [] };
  await notion('PATCH', `/pages/${pageId}`, { properties });
}

async function pendientes() {
  const res = await notion('POST', `/databases/${NOTION_DB_ID}/query`, {
    filter: { and: [
      { property: 'Statut', status: { equals: 'Nouveau' } },
      { property: 'Fichier', files: { is_not_empty: true } },
    ] },
    sorts: [{ timestamp: 'created_time', direction: 'ascending' }],
    page_size: MAX_POR_EJECUCION,
  });
  return res.results;
}

async function nombreCurso(page) {
  const rel = page.properties['Cours']?.relation?.[0];
  if (!rel) return '';
  const c = await notion('GET', `/pages/${rel.id}`);
  const t = Object.values(c.properties).find(p => p.type === 'title');
  return plain(t?.title);
}

async function descargar(page) {
  const f = page.properties['Fichier'].files[0];
  const url = f.type === 'file' ? f.file.url : f.external.url;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Descarga del archivo imposible (${r.status})`);
  const buf = Buffer.from(await r.arrayBuffer());
  const nombre = f.name || 'curso.pdf';
  const esPdf = buf.subarray(0, 4).toString() === '%PDF';
  if (!esPdf) throw new Error(`« ${nombre} » no es un PDF. Exporta el cours en PDF (PowerPoint/Keynote → Exporter → PDF) et redépose-le.`);
  if (buf.length > 30 * 1024 * 1024) throw new Error('PDF trop lourd (> 30 Mo). Compresse-le ou coupe-le en deux.');
  return { base64: buf.toString('base64'), nombre };
}

async function claude(pdf, contexto) {
  const system = await readFile(path.join(ROOT, 'prompts/ficha.md'), 'utf8');
  const body = {
    model: MODEL,
    max_tokens: 32000,
    system,
    messages: [{ role: 'user', content: [
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdf.base64 } },
      { type: 'text', text: `${contexto}\nArchivo: ${pdf.nombre}\nGenera la ficha y el QCM. Devuelve solo el JSON.` },
    ] }],
  };
  // streaming para respuestas largas
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ ...body, stream: true }),
  });
  if (!r.ok) throw new Error(`API Claude ${r.status}: ${await r.text()}`);
  let texto = '', buffer = '', stop = '';
  const dec = new TextDecoder();
  for await (const chunk of r.body) {
    buffer += dec.decode(chunk, { stream: true });
    let i;
    while ((i = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, i).trim(); buffer = buffer.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      const ev = JSON.parse(line.slice(5));
      if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') texto += ev.delta.text;
      if (ev.type === 'message_delta' && ev.delta?.stop_reason) stop = ev.delta.stop_reason;
      if (ev.type === 'error') throw new Error(`API Claude: ${ev.error?.message}`);
    }
  }
  if (stop === 'max_tokens') throw new Error('Réponse tronquée (cours trop long). Coupe le PDF en deux parties.');
  return parseJSON(texto);
}

function parseJSON(t) {
  const s = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  return JSON.parse(s.slice(a, b + 1));
}

// Reequilibra la letra correcta: cada letra 3–5 veces sobre 15, B y C limitadas a 3–4.
function reequilibrar(qcm) {
  const base = Math.random() < 0.5 ? { A: 4, B: 3, C: 3, D: 5 } : { A: 5, B: 3, C: 3, D: 4 };
  if (Math.random() < 0.5) { base.B = 4; base[base.A === 5 ? 'A' : 'D'] -= 1; }
  let seq = Object.entries(base).flatMap(([l, n]) => Array(n).fill('ABCD'.indexOf(l)));
  for (let i = seq.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [seq[i], seq[j]] = [seq[j], seq[i]]; }
  return qcm.map((q, k) => {
    const destino = seq[k % seq.length];
    const idx = [0, 1, 2, 3];
    const otros = idx.filter(i => i !== q.correcta);
    for (let i = otros.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [otros[i], otros[j]] = [otros[j], otros[i]]; }
    const orden = []; let o = 0;
    for (let p = 0; p < 4; p++) orden.push(p === destino ? q.correcta : otros[o++]);
    return { ...q, opciones: orden.map(i => q.opciones[i]), por_opcion: orden.map(i => q.por_opcion?.[i] || ''), correcta: destino };
  });
}

function validar(f) {
  if (!f.titulo || !Array.isArray(f.secciones) || !Array.isArray(f.qcm)) throw new Error('JSON de fiche incomplet');
  f.qcm = f.qcm.filter(q => Array.isArray(q.opciones) && q.opciones.length === 4 && q.correcta >= 0 && q.correcta < 4);
  if (f.qcm.length < 15) throw new Error(`QCM incomplet (${f.qcm.length}/15 questions valides)`);
  f.qcm = reequilibrar(f.qcm.slice(0, 15));
  return f;
}

const slugify = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

async function publicar(ficha, meta) {
  const tpl = await readFile(path.join(ROOT, 'templates/ficha.html'), 'utf8');
  const datos = JSON.stringify({ ...ficha, asignatura: meta.curso, tema: meta.tema, fecha: meta.fecha }).replace(/</g, '\\u003c');
  const html = tpl.replace('%%TITULO%%', `${ficha.titulo} · Ficha`.replace(/[<&]/g, '')).replace('%%DATOS%%', datos);
  const slug = `${slugify(meta.curso || 'curso')}-t${meta.tema ?? 'x'}-${slugify(ficha.titulo)}`;
  await mkdir(path.join(ROOT, 'fichas'), { recursive: true });
  await writeFile(path.join(ROOT, 'fichas', `${slug}.html`), html);
  const idxPath = path.join(ROOT, 'data/fichas.json');
  const idx = existsSync(idxPath) ? JSON.parse(await readFile(idxPath, 'utf8')) : [];
  const item = { slug, titulo: ficha.titulo, subtitulo: ficha.subtitulo || '', curso: meta.curso, tema: meta.tema, fecha: meta.fecha, preguntas: ficha.qcm.length, secciones: ficha.secciones.length };
  const sin = idx.filter(x => x.slug !== slug);
  sin.push(item);
  sin.sort((a, b) => (a.curso || '').localeCompare(b.curso || '') || (a.tema ?? 99) - (b.tema ?? 99));
  await writeFile(idxPath, JSON.stringify(sin, null, 2));
  return `${SITE_URL}fichas/${slug}.html`;
}

async function main() {
  if (DEMO) {
    const f = validar(JSON.parse(await readFile(path.join(ROOT, 'data/demo.json'), 'utf8')));
    console.log('Demo →', await publicar(f, { curso: f.asignatura || 'Demo', tema: f.tema ?? 0, fecha: new Date().toISOString().slice(0, 10) }));
    return;
  }
  for (const v of ['NOTION_TOKEN', 'ANTHROPIC_API_KEY', 'NOTION_DB_ID']) if (!process.env[v]) throw new Error(`Falta la variable ${v}`);
  const lista = await pendientes();
  console.log(`${lista.length} cours en attente`);
  for (const page of lista) {
    const titulo = plain(Object.values(page.properties).find(p => p.type === 'title')?.title);
    try {
      await setEstado(page.id, 'Fiche en cours');
      const curso = await nombreCurso(page);
      const tema = page.properties['Tema']?.number ?? null;
      const pdf = await descargar(page);
      const contexto = `Asignatura: ${curso || 'desconocida'}${tema != null ? ` · Tema ${tema}` : ''}${titulo ? ` · Título dado por el alumno: ${titulo}` : ''}`;
      console.log('→', contexto);
      const ficha = validar(await claude(pdf, contexto));
      const url = await publicar(ficha, { curso, tema, fecha: new Date().toISOString().slice(0, 10) });
      await setEstado(page.id, 'Fiche prête', { fiche: url });
      console.log('✓', url);
    } catch (e) {
      console.error('✗', titulo, e.message);
      await setEstado(page.id, 'Erreur', { message: e.message }).catch(() => {});
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
