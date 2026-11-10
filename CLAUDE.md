# Fichas de Valentin — mode Claude Code (sans API)

Ce dépôt publie les fiches de révision de Valentin (kiné, Universidad Europea de Valencia) sur
https://dsyzdfyzft-create.github.io/fichas/ et les relie à son Notion « Mi Academia · Fisioterapia ».
Ici, c'est TOI (Claude Code, sur son abonnement) qui rédiges les fiches : aucune clé API n'est utilisée.
Le script `scripts/local.mjs` fait tout le reste (Notion, téléchargement, images du PDF, mise en page, git).

Valentin parle français. Réponds en français, brièvement. Les fiches, elles, sont en espagnol.

## Prérequis (vérifie au début de chaque session, corrige sans demander si possible)
- `.env` à la racine contient `NOTION_TOKEN=...` (sinon, demande-lui son « Internal Integration Secret » Notion et crée le fichier ; il est ignoré par git).
- `pdftoppm` est installé (`which pdftoppm`) ; sinon : `brew install poppler` (installe Homebrew d'abord s'il manque, en le prévenant).
- Node ≥ 20 (`node -v`).
- Fais `git pull --rebase --autostash` avant de commencer.

## Qualité avant tout (règles non négociables)
- **Maximum 3 fiches par session.** `pendientes` n'en donne que 3 à la fois. Après 3 fiches, lance `fin`, puis dis à Valentin d'ouvrir une NOUVELLE session pour la suite (la qualité baisse quand le contexte se remplit de PDF).
- Chaque fiche doit être aussi riche que les meilleures du site : toutes les notions examinables du PDF, 5 à 9 sections selon la longueur, **2 à 4 schémas Mermaid**, au moins 2 tableaux, 2 perles cliniques, 3 alertes d'examen, 2 blocs « dato », jusqu'à 5 figures (pages du PDF qui contiennent une vraie image), résumé en 5 phrases, 8–10 « Pregúntate », cas clinique, glossaire ≥ 8, QCM de 15 questions.
- Lis le PDF EN ENTIER avant d'écrire, page par page. Ne résume pas un résumé.
- `publicar` applique un contrôle qualité et REFUSE une fiche trop légère en listant ce qui manque : complète le JSON (en relisant le PDF) et relance. N'utilise `--forzar` que si le PDF est réellement très court (moins de 10 pages) et dis-le à Valentin.

## « Refais les fiches … »
`node scripts/local.mjs rehacer "<cours>" <tema> [<tema> …]` remet ces cours sur « Nouveau » dans Notion, puis traite le dépôt normalement (3 par session). L'ancienne fiche est remplacée, le thème Notion et son score sont conservés.

## « Traite le dépôt » / « fais mes fiches »
1. `node scripts/local.mjs pendientes` → JSON avec la liste des cours à traiter (`fichas`) et des grands QCM demandés (`grandes_qcm`). Chaque cours est passé à « Fiche en cours » dans Notion.
2. Pour CHAQUE cours de `fichas` :
   - Lis le PDF `entrada/<id>.pdf` en entier (toutes les pages, y compris les images : note les numéros des pages qui contiennent une image vraiment utile).
   - Lis `entrada/<id>.meta.json` (cours, tema).
   - Rédige la fiche en suivant EXACTEMENT `prompts/ficha.md` (fiche en espagnol, schémas Mermaid, figures = numéros de page du PDF, résumé en 5 phrases, Pregúntate, code couleur, QCM de 15 questions très difficiles sans indice visuel, explications ✅/❌ par option).
   - Écris le JSON (et uniquement le JSON valide) dans `entrada/<id>.json`.
   - Lance `node scripts/local.mjs publicar <id>` : il rééquilibre les bonnes réponses, découpe les pages-figures du PDF, génère la page, met à jour la bibliothèque, Notion (« Fiche prête » + lien) et crée le thème. S'il échoue sur le JSON, corrige-le et relance.
   - Si un PDF est illisible : `node scripts/local.mjs error <id> "raison"`.
3. Pour CHAQUE grand QCM de `grandes_qcm` :
   - Lis `entrada/qcm-<id>.contexto.md`.
   - Rédige 30 questions NOUVELLES en suivant `prompts/grand-qcm.md` et écris le JSON dans `entrada/qcm-<id>.json`.
   - Lance `node scripts/local.mjs publicar-qcm <id>`.
4. Termine par `node scripts/local.mjs fin` (applique le design à toutes les pages, commit et push). Le site se met à jour en 1 à 3 minutes.
5. Résume en 3 lignes : fiches publiées (avec liens), erreurs éventuelles.

## « Ajoute ce cours » (PDF glissé dans la conversation)
1. Demande le cours et le numéro du tema s'ils ne sont pas évidents (nom du fichier, contenu).
2. Enregistre le PDF dans le dossier du dépôt si besoin, puis : `node scripts/local.mjs nuevo "<chemin du pdf>" "<cours>" <tema>` → crée la ligne dans « Dépôt des cours » avec le PDF joint et prépare `entrada/<id>.*`.
3. Continue comme à l'étape 2 ci-dessus, puis `node scripts/local.mjs fin`.

## Règles
- Ne modifie pas `templates/`, `prompts/`, `scripts/` ni `.github/` sauf si Valentin le demande explicitement.
- N'ajoute jamais `.env` ni `entrada/` à git.
- Fidélité au PDF : n'invente ni chiffres ni auteurs.
