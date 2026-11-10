// Relais des scores de QCM → Notion (Cloudflare Worker, gratuit).
// Secret à ajouter dans le Worker : NOTION_TOKEN (le même que dans GitHub / .env).
const SITE = 'https://dsyzdfyzft-create.github.io';
const THEMES_DB = '38701e4575f04287a028802d9913a76d';

export default {
  async fetch(req, env) {
    const cors = { 'Access-Control-Allow-Origin': SITE, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Content-Type': 'application/json' };
    const out = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: cors });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method !== 'POST') return out({ ok: false, error: 'POST uniquement' }, 405);
    if (req.headers.get('Origin') !== SITE) return out({ ok: false, error: 'origine refusée' }, 403);
    let b; try { b = await req.json(); } catch { return out({ ok: false, error: 'JSON invalide' }, 400); }
    const url = String(b.url || ''), score = Number(b.score), total = Number(b.total);
    if (!url.startsWith(SITE + '/fichas/fichas/') || !(total > 0) || !(score >= 0) || score > total) return out({ ok: false, error: 'données invalides' }, 400);

    const H = { 'Authorization': `Bearer ${env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' };
    const q = await (await fetch(`https://api.notion.com/v1/databases/${THEMES_DB}/query`, { method: 'POST', headers: H, body: JSON.stringify({ filter: { property: 'Fiche', url: { equals: url } }, page_size: 1 }) })).json();
    const page = q.results?.[0];
    if (!page) return out({ ok: false, error: 'thème introuvable dans Notion' }, 404);

    const sobre15 = Math.round(score / total * 15), pct = score / total * 100;
    const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date()); // AAAA-MM-JJ
    const r = await fetch(`https://api.notion.com/v1/pages/${page.id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ properties: {
      'Dernier score QCM': { number: sobre15 },
      'Date du dernier QCM': { date: { start: hoy } },
      'Maîtrise': { select: { name: pct >= 80 ? 'Maîtrisé' : 'À revoir' } },
    } }) });
    if (!r.ok) return out({ ok: false, error: 'Notion a refusé la mise à jour' }, 502);
    return out({ ok: true, score: sobre15 });
  },
};
