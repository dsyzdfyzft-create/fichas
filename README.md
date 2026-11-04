# fichas · génération automatique de fiches

Tu déposes un PDF de cours dans Notion (base **Dépôt des cours**). Toutes les 15 minutes, GitHub :

1. récupère les cours au statut « Nouveau » ;
2. envoie le PDF à Claude avec les consignes de `prompts/ficha.md` (fiche en espagnol + QCM de 15 questions très difficiles) ;
3. publie la fiche sur ton site GitHub Pages ;
4. met le lien dans la colonne « Fiche » et passe le statut à « Fiche prête ».

## Installation (une seule fois, ~15 min)

### 1. Créer le dépôt
- Sur GitHub : **New repository** → nom `fichas` → **Public** → Create.
- **Add file → Upload files** → glisse tout le contenu de ce dossier (y compris le dossier caché `.github` ; sur Mac, `Cmd + Maj + .` pour l’afficher) → Commit.

### 2. Activer le site
- **Settings → Pages** → Source : *Deploy from a branch* → Branch : `main` / `(root)` → Save.
- Ton site sera à `https://<ton-pseudo>.github.io/fichas/`.

### 3. Clé Notion
- Va sur https://www.notion.so/profile/integrations → **New integration** → type *Internal*, espace « Notion de Valentin vaissie » → Save.
- Onglet **Capabilities** : coche *Read content*, *Update content*. Copie le **Internal Integration Secret**.
- Dans Notion, ouvre la page **Mi Academia · Fisioterapia** → `•••` en haut à droite → **Connexions** → ajoute ton intégration (elle aura accès à toutes les bases de la page).

### 4. Clé Claude (API)
- https://console.anthropic.com → **API Keys** → Create key. Ajoute un peu de crédit dans *Billing* (une fiche coûte quelques dizaines de centimes selon la longueur du PDF ; tu peux fixer une limite mensuelle).

### 5. Secrets GitHub
Dans le dépôt : **Settings → Secrets and variables → Actions**.

Onglet **Secrets** → *New repository secret* :
| Nom | Valeur |
|---|---|
| `NOTION_TOKEN` | le secret de l’intégration Notion |
| `ANTHROPIC_API_KEY` | la clé de l’API Claude |

Onglet **Variables** → *New repository variable* :
| Nom | Valeur |
|---|---|
| `NOTION_DB_ID` | `1657d5f0191f4d3980d98baa0ceeb0e0` |
| `SITE_URL` | `https://<ton-pseudo>.github.io/fichas/` |
| `MODEL` (optionnel) | `claude-sonnet-5-5` par défaut, `claude-opus-5-5` pour encore plus de qualité |

### 6. Tester
- Dans Notion, ajoute une ligne dans **Dépôt des cours** avec un PDF, le cours et le numéro du tema.
- Sur GitHub : **Actions → Generar fichas → Run workflow**. Après 2–4 min, le statut passe à « Fiche prête » et le lien apparaît.

## Utilisation au quotidien
- **Déposer** : une ligne par PDF dans « Dépôt des cours ». Rien d’autre.
- **Refaire une fiche** : remets le statut sur « Nouveau ».
- **Erreur** : le statut passe à « Erreur » et la colonne « Message » explique quoi faire (fichier non PDF, PDF trop lourd…).
- **Bibliothèque** : la page d’accueil du site liste toutes les fiches par matière avec ton dernier score au QCM.
- **Changer les consignes** : modifie `prompts/ficha.md` directement sur GitHub.

## Fichiers
- `scripts/generar.mjs` : le robot (Node 20, aucune dépendance).
- `prompts/ficha.md` : les consignes de la fiche et du QCM.
- `templates/ficha.html` : le design des fiches (Fraunces + Spectral, sommaire, tableaux, perles cliniques, QCM avec barre de progression).
- `index.html` : la bibliothèque des fiches.
- `.github/workflows/fichas.yml` : le déclenchement toutes les 15 min.

Note : le dépôt étant public, les fiches le sont aussi (comme ton cockpit). Ne mets pas de documents personnels dans le dépôt.
