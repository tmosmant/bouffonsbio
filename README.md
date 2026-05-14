# Bouffons Bios

Site [Astro](https://astro.build) + [Decap CMS](https://decapcms.org), déployé sur **Cloudflare Workers** (Worker Astro + assets statiques).

**Domaine de prod** : [bouffonsbios.org](https://bouffonsbios.org) (**Bios** avec un **s** — pas `bouffonsbio.org`).

## Prérequis

- **Node** ≥ 22.12 (voir `package.json` → `engines`)

## URLs

| Ressource | URL |
|-----------|-----|
| Site (prod) | <https://bouffonsbios.org> · <https://www.bouffonsbios.org> |
| Alias Workers | <https://bouffonsbios.thomas-mosmant.workers.dev> |
| Admin Decap | <https://bouffonsbios.org/admin/> |
| OAuth GitHub (proxy) | <https://bouffonsbios-oauth.thomas-mosmant.workers.dev> |
| Déploiements (historique / retry) | [Workers & Pages](https://dash.cloudflare.com/) → worker concerné → *Deployments* |

## Développement

```sh
npm install
npm run dev
```

- Site : <http://localhost:4321>
- Admin : <http://localhost:4321/admin/> — avec `local_backend: true` dans `public/admin/config.yml`, prévoir le [mode local Decap](https://decapcms.org/docs/working-with-a-local-git-repository/) si tu édites le dépôt Git depuis ta machine.

### Carte Mapbox (plan d’accès)

La page `/plan-dacces/` utilise [Mapbox GL JS](https://docs.mapbox.com/mapbox-gl-js/) (style hébergé sur ton compte Mapbox).

- **En local** : copier `.env.example` vers `.env` et renseigner `PUBLIC_MAPBOX_ACCESS_TOKEN=pk.…`
- **Sur le Worker `bouffonsbios`** : ajouter la même variable dans Cloudflare (*Workers* → *bouffonsbios* → *Settings* → *Variables and Secrets*). La page est rendue côté serveur : le jeton doit être présent **sur le Worker**, pas seulement au build CI.
- Restreindre le jeton par URL dans [Mapbox Account](https://account.mapbox.com/).

## Déploiement

En production, le déploiement est déclenché **sur Cloudflare** à chaque push sur **`main`** : [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/) clone le dépôt, exécute les commandes configurées dans le dashboard, puis lance Wrangler. **Aucun GitHub Actions** n’est utilisé pour ça.

### Worker site (`bouffonsbios`)

À configurer une fois dans le dashboard Cloudflare (*Workers & Pages* → **bouffonsbios** → *Settings* → *Builds* / *Connect to Git*, libellés selon l’interface) :

| Réglage | Valeur |
|--------|--------|
| Dépôt | `tmosmant/bouffonsbios` |
| Branche prod | `main` |
| Build command | `npm install && npm run build` |
| Deploy command | `npx wrangler deploy && node scripts/telegram-notify-deploy.mjs` |
| Racine du projet | `.` (racine du dépôt) |

**Build command** : `npm install` suffit en général pour un dépôt solo (souvent un peu plus rapide que `npm ci`, qui supprime toujours `node_modules` avant de réinstaller). Pour une CI très stricte sur le lockfile, tu peux utiliser `npm ci && npm run build` à la place. Il faut **au moins** une install avant `npm run build` : sans `node_modules`, le build échoue.

Active aussi **Build cache** (*Settings* → *Build* → *Build cache*) pour réutiliser le cache npm (`.npm`) et le cache Astro (`.astro`).

**Variables de build** (même écran, *Build variables* / secrets de build) : ajouter `PUBLIC_MAPBOX_ACCESS_TOKEN` si le build en a besoin. Pour la **notif Telegram au déploy**, ajoute aussi `TELEGRAM_BOT_TOKEN` et `TELEGRAM_CHAT_ID` (même couple que ci-dessous, exposé uniquement pendant l’étape *Deploy*). En runtime, la carte utilise surtout la variable Mapbox **sur le Worker** (voir section Mapbox ci-dessus).

### Notifications Telegram

Trois canaux : **deploy** (message fixe après `wrangler deploy`), **newsletter** (nouvelle inscription seulement), **rapport Umami hebdomadaire** (vendredi, worker dédié).

| Secret / variable | Où les définir | Rôle |
|-------------------|----------------|------|
| `TELEGRAM_BOT_TOKEN` | Build (deploy) + Worker `bouffonsbios` + Worker `bouffonsbios-weekly-stats` | Token du bot ([@BotFather](https://core.telegram.org/bots/tutorial)) |
| `TELEGRAM_CHAT_ID` | Idem | ID du destinataire ou du groupe (voir *getUpdates* après un message envoyé au bot) |
| `UMAMI_API_KEY` | Secrets du worker **bouffonsbios-weekly-stats** | Clé API [Umami Cloud](https://umami.is/docs/cloud/api-key) |
| — | Vars du worker weekly (voir `workers/weekly-umami-stats/wrangler.jsonc`) | `UMAMI_WEBSITE_ID`, `UMAMI_API_BASE` (région, ex. `https://api.umami.is/v1/eu` si nécessaire) |

1. **Déployé** — la commande *Deploy* ci-dessus exécute `scripts/telegram-notify-deploy.mjs`, qui envoie : « CloudFlare a déployé le site. » Si les variables Telegram ne sont pas définies **dans l’étape build**, le script se contente d’un log et quitte avec succès (`npm run deploy` local idem sans tokens).
2. **Newsletter** — sur le Worker **bouffonsbios** :  
   `npx wrangler secret put TELEGRAM_BOT_TOKEN`  
   et `TELEGRAM_CHAT_ID` (variable sensible ou secret selon ton habitude dans le dashboard). Sans ces clés, l’API newsletter ne fait rien de plus.
3. **Hebdomadaire** — créer dans Cloudflare un worker depuis `workers/weekly-umami-stats/` (`npm run deploy:weekly-stats`). Cron vendredi **18:00 UTC** (≈ 20 h été Paris) dans `workers/weekly-umami-stats/wrangler.jsonc` — adapte selon fuseau ou horaire préféré. Message : fenêtre glissante **7 jours**, pages vues / visiteurs / visites, rebond, **top 5** des URLs, évolution vs la semaine précédente.

Cloudflare fournit en général un **API token** dédié aux builds ; tu n’as pas besoin de `CLOUDFLARE_API_TOKEN` côté GitHub.

### Worker OAuth Decap (`bouffonsbios-oauth`)

Créer un **second** Worker lié au **même** dépôt et à **`main`**, avec par exemple :

| Réglage | Valeur |
|--------|--------|
| Build command | `npm install` |
| Deploy command | `npx wrangler deploy -c workers/decap-oauth/wrangler.jsonc` |

Ainsi un push sur `main` met à jour les deux workers. Si tu préfères ne déployer l’OAuth qu’à la main, omettre la connexion Git sur ce worker et utiliser uniquement `npm run deploy:oauth` après changement sous `workers/decap-oauth/`.

### En local

```sh
npm run deploy               # site (build + wrangler + notif Telegram deploy si configuré)
npm run deploy:oauth        # worker OAuth seul
npm run deploy:weekly-stats # worker rapport Umami vendredi soir (cron)
```

En local (`wrangler dev`), copier [`.dev.vars.example`](.dev.vars.example) vers `.dev.vars` (ignoré par Git) pour `PUBLIC_MAPBOX_ACCESS_TOKEN` et, pour tester Telegram en local, les clés listées dans l’exemple.

## Infra Cloudflare

| Élément | Fichier / nom |
|---------|----------------|
| Site + API Astro | `wrangler.jsonc` → worker **bouffonsbios** |
| OAuth Decap | `workers/decap-oauth/wrangler.jsonc` → **bouffonsbios-oauth** |
| Rapports Umami → Telegram | `workers/weekly-umami-stats/wrangler.jsonc` → **bouffonsbios-weekly-stats** |
| Newsletter (D1) | Binding `NEWSLETTER_DB` dans `wrangler.jsonc` ; schéma SQL dans `schema/` |

## Decap + GitHub en production

1. **GitHub** → *Settings* → *Developer settings* → *OAuth Apps* → *New OAuth App*  
   - **Homepage URL** : `https://bouffonsbios.org`  
   - **Authorization callback URL** :  
     `https://bouffonsbios-oauth.thomas-mosmant.workers.dev/callback?provider=github`  
   - Scopes : `public_repo`, `user`, `user:email` (e-mails vérifiés → avatar Gravatar côté admin). Après changement de scopes, chaque éditeur doit se **reconnecter** une fois.

2. **Cloudflare** — worker **`bouffonsbios-oauth`** :

   ```sh
   npx wrangler secret put GITHUB_OAUTH_SECRET -c workers/decap-oauth/wrangler.jsonc
   npx wrangler vars put GITHUB_OAUTH_ID -c workers/decap-oauth/wrangler.jsonc
   ```

   Client ID → variable, client secret → secret. **Ne pas** commiter ces valeurs dans `wrangler.jsonc` : les gérer via `wrangler` ou le dashboard.

3. **Code du worker OAuth** : après changement sous `workers/decap-oauth/`, pousser sur `main` (si ce worker est branché aux *Workers Builds*) ou lancer `npm run deploy:oauth`.

4. **Site + contenu** : après push sur `main`, Cloudflare rebuild depuis le dépôt distant — les changements non poussés ne partent pas en prod.

Si l’URL du worker OAuth change, mettre à jour `ALLOWED_ORIGINS` dans `public/admin/decap-gravatar.js`.

Sans l’étape 2, `/auth` sur le worker OAuth répond **503** avec un message explicite.

## Contenu & CMS

Fichiers éditables via **Decap** (`/admin/`) ou à la main ; schéma Zod : `src/content.config.ts`. Après gros changements de schéma : `npx astro sync`.

| Zone | Emplacement |
|------|-------------|
| Articles | `src/content/articles/*.md` |
| Accueil (héros, CTA, etc.) | `src/content/home.json` |
| Menu principal | `src/content/navigation.json` (`nav.items` : `id`, `title`, `href`, `emphasized`) |
| Bandeau flash | `src/content/flash.json` |
| Contact | `src/content/contact.json` |
| Manifeste | `src/content/manifeste.json` |
| Bloc presse (accueil) | `src/content/presse.json` |
| Médias | `public/uploads/` |

Les **`id`** des liens de navigation doivent rester alignés avec le prop `current` des pages dans `src/pages/` (ex. `highlight`, `articles`, `manifeste`, `contact`, `plan`) pour l’état actif du menu.

### Scripts npm

| Commande | Rôle |
|----------|------|
| `npm run dev` | Serveur de dev Astro |
| `npm run build` | Build production → `dist/` |
| `npm run deploy` | Build + `wrangler deploy` + notif Telegram (si variables présentes) |
| `npm run deploy:oauth` | Déploie uniquement le worker OAuth |
| `npm run deploy:weekly-stats` | Déploie le worker rapport Umami (cron vendredi UTC) |
| `npm run import:wp` | Import WordPress (WXR) → articles Markdown |
| `npm run assign:categories` | Recalcule les catégories depuis les slugs de fichiers |
| `npm run generate-types` | `wrangler types` (bindings Worker) |

### Import WordPress (WXR)

Export **Outils → Exporter** (`.xml`) : titre, dates, catégories, extrait, contenu → front matter + Markdown.

```sh
npm run import:wp -- /chemin/vers/export.xml
```

Sans argument : recherche par défaut `~/Downloads/bouffonsbios.WordPress.YYYY-MM-DD.xml`. **Remplace** les `.md` du dossier articles (billets publiés uniquement). Liens `bouffonsbios.wordpress.com` → `https://bouffonsbios.org`. Images WordPress en hotlink `*.files.wordpress.com` tant qu’elles y sont servies.

### Catégories (sans réimporter le WXR)

```sh
npm run assign:categories
```

## Dépôt

<https://github.com/tmosmant/bouffonsbios>
