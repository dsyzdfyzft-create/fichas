// Mode local SANS API : c'est Claude Code (abonnement) qui rédige les fiches.
// Ce script fait tout le reste : Notion, PDF, images, mise en page, bibliothèque, git.
// Usage (depuis le dossier du dépôt) :
//   node scripts/local.mjs pendientes            → télécharge les cours « Nouveau » + les grands QCM demandés dans entrada/
//   node scripts/local.mjs nuevo <pdf> <cours> [tema] → ajoute un PDF reçu dans le chat (crée la ligne Notion avec le PDF)
//   node scripts/local.mjs rehacer "<cours>" <tema> [<tema>…] → remet des fiches déjà faites sur « Nouveau » pour les refaire
//   node scripts/local.mjs publicar <id> [--forzar] → publie entrada/<id>.json (fiche écrite par Claude) avec images ; refuse si la qualité est insuffisante
//   node scripts/local.mjs publicar-qcm <id>     → publie entrada/qcm-<id>.json (grand QCM écrit par Claude)
//   node scripts/local.mjs error <id> "message"  → marque le cours en erreur dans Notion
//   node scripts/local.mjs fin                   → applique le design, commit et push vers GitHub
import { readFile, writeFile, mkdir, rm, readdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT0 = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
// .env local (jamais envoyé sur GitHub)
const envFile = path.join(ROOT0, '.env');
if (existsSync(envFile)) for (const l of readFileSync(envFile, 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
if (!process.env.NOTION_TOKEN) { console.error('Il manque NOTION_TOKEN dans le fichier .env'); process.exit(1); }

const G = await import('./generar.mjs');
const { notion, plain, setEstado, validar, publicar, crearTema, leerFicha, textoFicha, rerenderTodo, reequilibrar, slugify, ROOT, SITE_URL, NOTION_DB_ID, COURS_DB_ID } = G;
const ENT = path.join(ROOT, 'entrada');
const [cmd, arg, ...resto] = process.argv.slice(2);

async function pendientes() {
  await mkdir(ENT, { recursive: true });
  const res = await notion('POST', `/databases/${NOTION_DB_ID}/query`, {
    filter: { and: [{ property: 'Statut', status: { equals: 'Nouveau' } }, { property: 'Fichier', files: { is_not_empty: true } }] },
    sorts: [{ property: 'Tema', direction: 'ascending' }], page_size: Number(process.env.MAX_FICHAS || 3),
  });
  const lista = [];
  for (const page of res.results) {
    const titulo = plain(Object.values(page.properties).find(p => p.type === 'title')?.title);
    const rel = page.properties['Cours']?.relation?.[0];
    let curso = '';
    if (rel) { const c = await notion('GET', `/pages/${rel.id}`); curso = plain(Object.values(c.properties).find(p => p.type === 'title')?.title); }
    const tema = page.properties['Tema']?.number ?? null;
    const f = page.properties['Fichier'].files[0];
    const url = f.type === 'file' ? f.file.url : f.external.url;
    const r = await fetch(url);
    const buf = Buffer.from(await r.arrayBuffer());
    const id = page.id.replace(/-/g, '');
    if (buf.subarray(0, 4).toString() !== '%PDF') { await setEstado(page.id, 'Erreur', { message: `« ${f.name} » n'est pas un PDF : exporte-le en PDF et redépose-le.` }); continue; }
    await writeFile(path.join(ENT, `${id}.pdf`), buf);
    await writeFile(path.join(ENT, `${id}.meta.json`), JSON.stringify({ pageId: page.id, cursoId: rel?.id || null, curso, tema, titulo, archivo: f.name }, null, 2));
    await setEstado(page.id, 'Fiche en cours');
    lista.push({ id, curso, tema, titulo, pdf: `entrada/${id}.pdf` });
  }
  // grands QCM demandés
  const q = await notion('POST', `/databases/${COURS_DB_ID}/query`, { filter: { property: 'Demander un grand QCM', checkbox: { equals: true } }, page_size: 5 });
  const idx = existsSync(path.join(ROOT, 'data/fichas.json')) ? JSON.parse(await readFile(path.join(ROOT, 'data/fichas.json'), 'utf8')) : [];
  const qcms = [];
  for (const c of q.results) {
    const curso = plain(Object.values(c.properties).find(p => p.type === 'title')?.title);
    const items = idx.filter(x => x.curso === curso);
    const id = c.id.replace(/-/g, '');
    if (!items.length) { await notion('PATCH', `/pages/${c.id}`, { properties: { 'Demander un grand QCM': { checkbox: false } } }); continue; }
    const fichas = await Promise.all(items.map(x => leerFicha(x.slug)));
    const conocidas = fichas.flatMap(f => (f.qcm || []).map(x => '- ' + x.pregunta));
    await writeFile(path.join(ENT, `qcm-${id}.contexto.md`), `Asignatura: ${curso}\n\n# Contenido de las fichas\n${fichas.map(textoFicha).join('\n\n')}\n\n# Preguntas ya conocidas (NO repetir)\n${conocidas.join('\n')}\n`);
    await writeFile(path.join(ENT, `qcm-${id}.meta.json`), JSON.stringify({ pageId: c.id, curso, fichas: items.map(x => ({ slug: x.slug, titulo: x.titulo })) }, null, 2));
    qcms.push({ id, curso, contexto: `entrada/qcm-${id}.contexto.md` });
  }
  console.log(JSON.stringify({ fichas: lista, grandes_qcm: qcms }, null, 2));
}

// Ajoute un PDF reçu dans Claude Code : crée la ligne Notion (avec le PDF joint) et le prépare dans entrada/
async function nuevo(ruta, cursoBuscado, tema) {
  await mkdir(ENT, { recursive: true });
  const buf = await readFile(ruta);
  if (buf.subarray(0, 4).toString() !== '%PDF') throw new Error('Ce fichier n’est pas un PDF.');
  const nombre = path.basename(ruta);
  const cs = await notion('POST', `/databases/${COURS_DB_ID}/query`, { page_size: 50 });
  const norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const c = cs.results.find(p => norm(plain(Object.values(p.properties).find(x => x.type === 'title')?.title)).includes(norm(cursoBuscado)));
  if (!c) throw new Error(`Cours introuvable : « ${cursoBuscado} »`);
  const curso = plain(Object.values(c.properties).find(x => x.type === 'title')?.title);
  // envoi du PDF dans Notion si possible (le forfait gratuit de Notion limite à 5 Mo) ;
  // au-delà, le PDF reste seulement sur le Mac : la fiche se fait quand même.
  const H = { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28' };
  let fichier = null, aviso = '';
  try {
    if (buf.length > 5 * 1024 * 1024) throw new Error('PDF de plus de 5 Mo');
    const up = await (await fetch('https://api.notion.com/v1/file_uploads', { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'single_part', filename: nombre, content_type: 'application/pdf' }) })).json();
    if (!up.id) throw new Error(up.message || 'envoi refusé');
    const fd = new FormData(); fd.append('file', new Blob([buf], { type: 'application/pdf' }), nombre);
    const r = await fetch(`https://api.notion.com/v1/file_uploads/${up.id}/send`, { method: 'POST', headers: H, body: fd });
    if (!r.ok) throw new Error(await r.text());
    fichier = up.id;
  } catch (e) { aviso = `PDF non joint dans Notion (${e.message}) : traité depuis le Mac.`; console.log('ℹ️', aviso); }
  const page = await notion('POST', '/pages', { parent: { database_id: NOTION_DB_ID }, properties: {
    'Cours déposé': { title: [{ text: { content: nombre.replace(/\.pdf$/i, '') } }] },
    'Cours': { relation: [{ id: c.id }] },
    ...(tema ? { 'Tema': { number: Number(tema) } } : {}),
    'Statut': { status: { name: 'Fiche en cours' } },
    ...(fichier ? { 'Fichier': { files: [{ type: 'file_upload', file_upload: { id: fichier }, name: nombre }] } } : {}),
    ...(aviso ? { 'Message': { rich_text: [{ text: { content: aviso } }] } } : {}),
  } });
  const id = page.id.replace(/-/g, '');
  await writeFile(path.join(ENT, `${id}.pdf`), buf);
  await writeFile(path.join(ENT, `${id}.meta.json`), JSON.stringify({ pageId: page.id, cursoId: c.id, curso, tema: tema ? Number(tema) : null, titulo: nombre, archivo: nombre }, null, 2));
  console.log(JSON.stringify({ id, curso, tema, pdf: `entrada/${id}.pdf` }));
}

async function publicarFicha(id) {
  const meta = JSON.parse(await readFile(path.join(ENT, `${id}.meta.json`), 'utf8'));
  const crudo = await readFile(path.join(ENT, `${id}.json`), 'utf8');
  const ficha = validar(JSON.parse(crudo.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')));
  const pdf = await readFile(path.join(ENT, `${id}.pdf`));
  const url = await publicar(ficha, { curso: meta.curso, tema: meta.tema, fecha: new Date().toISOString().slice(0, 10) }, pdf, { forzar: process.argv.includes('--forzar') });
  await setEstado(meta.pageId, 'Fiche prête', { fiche: url });
  const pageFalsa = { properties: { Cours: { relation: meta.cursoId ? [{ id: meta.cursoId }] : [] } } };
  await crearTema(pageFalsa, ficha, meta.tema, url).catch(e => console.error('Thème non créé :', e.message));
  for (const ext of ['.json', '.meta.json', '.pdf']) await rm(path.join(ENT, id + ext), { force: true });
  console.log('✓', url);
}

async function publicarQCM(id) {
  const meta = JSON.parse(await readFile(path.join(ENT, `qcm-${id}.meta.json`), 'utf8'));
  const crudo = await readFile(path.join(ENT, `qcm-${id}.json`), 'utf8');
  const g = JSON.parse(crudo.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, ''));
  g.qcm = (g.qcm || []).filter(q => Array.isArray(q.opciones) && q.opciones.length === 4 && q.correcta >= 0 && q.correcta < 4);
  if (g.qcm.length < 20) throw new Error(`grand QCM incomplet (${g.qcm.length} questions)`);
  g.qcm = reequilibrar(g.qcm.slice(0, 30));
  const fecha = new Date().toISOString().slice(0, 10);
  const datos = { ...g, tipo: 'grand-qcm', secciones: [], asignatura: meta.curso, fecha, fichas: meta.fichas };
  const tpl = await readFile(path.join(ROOT, 'templates/ficha.html'), 'utf8');
  const html = tpl.replace('%%TITULO%%', (g.titulo || `Gran QCM · ${meta.curso}`).replace(/[<&]/g, '')).replace('%%DATOS%%', JSON.stringify(datos).replace(/</g, '\\u003c'));
  const slug = `${slugify(meta.curso)}-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}`;
  await mkdir(path.join(ROOT, 'qcm'), { recursive: true });
  await writeFile(path.join(ROOT, 'qcm', `${slug}.html`), html);
  const url = `${SITE_URL}qcm/${slug}.html`;
  await notion('PATCH', `/pages/${meta.pageId}`, { properties: { 'Demander un grand QCM': { checkbox: false }, 'Grand QCM': { url }, 'Grand QCM généré le': { date: { start: fecha } } } });
  for (const ext of ['.json', '.meta.json', '.contexto.md']) await rm(path.join(ENT, `qcm-${id}${ext}`), { force: true });
  console.log('✓', url);
}

// Remet des cours déjà faits sur « Nouveau » pour les refaire : rehacer "<cours>" <tema> [<tema> ...]
async function rehacer(cursoBuscado, temas) {
  const norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const cs = await notion('POST', `/databases/${COURS_DB_ID}/query`, { page_size: 50 });
  const c = cs.results.find(p => norm(plain(Object.values(p.properties).find(x => x.type === 'title')?.title)).includes(norm(cursoBuscado)));
  if (!c) throw new Error(`Cours introuvable : « ${cursoBuscado} »`);
  for (const t of temas.map(Number)) {
    const r = await notion('POST', `/databases/${NOTION_DB_ID}/query`, { filter: { and: [{ property: 'Cours', relation: { contains: c.id } }, { property: 'Tema', number: { equals: t } }] }, page_size: 5 });
    const conPdf = r.results.find(p => (p.properties['Fichier']?.files || []).length);
    if (!conPdf) { console.log(`✗ tema ${t} : aucune ligne avec PDF dans « Dépôt des cours » (glisse le PDF dans Claude Code et utilise « nuevo »)`); continue; }
    await setEstado(conPdf.id, 'Nouveau');
    console.log(`↻ tema ${t} remis sur « Nouveau »`);
  }
}

async function fin() {
  await rerenderTodo();
  const git = (...a) => execFileSync('git', a, { cwd: ROOT, stdio: 'inherit' });
  git('pull', '--rebase', '--autostash');
  git('add', 'fichas', 'data', ...(existsSync(path.join(ROOT, 'qcm')) ? ['qcm'] : []));
  try { execFileSync('git', ['diff', '--cached', '--quiet'], { cwd: ROOT }); console.log('Rien de nouveau à publier.'); }
  catch { git('commit', '-m', 'Nouvelles fiches (Claude Code)'); git('push'); console.log('Publié. Le site se met à jour en 1 à 3 minutes.'); }
}

if (cmd === 'pendientes') await pendientes();
else if (cmd === 'nuevo') await nuevo(arg, resto[0] || '', resto[1]);
else if (cmd === 'rehacer') await rehacer(arg, resto);
else if (cmd === 'publicar') await publicarFicha(arg);
else if (cmd === 'publicar-qcm') await publicarQCM(arg);
else if (cmd === 'error') { const meta = JSON.parse(await readFile(path.join(ENT, `${arg}.meta.json`), 'utf8')); await setEstado(meta.pageId, 'Erreur', { message: resto.join(' ') }); }
else if (cmd === 'fin') await fin();
else console.log('Commandes : pendientes | nuevo <pdf> <cours> [tema] | rehacer "<cours>" <temas…> | publicar <id> [--forzar] | publicar-qcm <id> | error <id> "message" | fin');
