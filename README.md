# La Radio AI — l'app

L'app d'écoute de **La Radio AI** : le direct des deux antennes (français, anglais), les
podcasts de toutes les émissions telles qu'elles sont passées à l'antenne, et les films de
Marvin. Une **PWA** : elle s'installe sur iPhone et Android depuis le navigateur, sans store,
et se met à jour toute seule.

> Pour reprendre le chantier, lire **`HANDOFF.md`** d'abord. Ce README dit comment ça
> marche et pourquoi.

## Où ça tourne

| Quoi | Où |
|---|---|
| L'app | GitHub Pages, publiée par `.github/workflows/deploy.yml` à chaque push sur `main` |
| Le direct | AzuraCast, flux publics `stream.la-radio.ai` (FR) et `:8010` / `/listen/airia/` (EN) |
| Les podcasts | AzuraCast, station 1, API publique `/api/station/1/public/podcasts` + flux RSS |
| Leur alimentation | `la-radio-magazine/scripts/vps/podcasts-sync.py`, cron VPS toutes les 15 min |
| Les vidéos | `public/videos.json`, régénéré chaque jour par le workflow (`scripts/videos.mjs`) |

L'app ne possède **aucun secret** et ne parle qu'à des points d'entrée publics : c'est ce
qui permet de la servir en statique et de l'installer chez n'importe qui.

## Comment ça marche

```
   archive d'antenne (VPS)            AzuraCast (VPS)                       l'app (Pages)
 diffusion-*.jsonl ──┐                                                    ┌──────────────┐
 episodes-*.jsonl  ──┤  podcasts-sync.py   playlists cachées « Podcast · X »│ Direct       │
                     └──── 15 min ────────►  ─┬─ (tâche AzuraCast, 10 min)  │ Podcasts ◄───┼── API publique + RSS
                                              └─► podcasts + épisodes       │ Vidéos  ◄────┼── videos.json
                                                   (média non copié)        └──────────────┘
```

* **Le catalogue des émissions vit côté antenne**, dans `SHOWS` de `podcasts-sync.py`
  (titre, langue, description, playlists AzuraCast qui alimentent l'émission). L'app
  retrouve le `slug` dans le champ `link` du podcast et n'a qu'un habillage par slug
  (`src/shows.ts`) — une émission inconnue s'affiche quand même, en violet.
* **Les podcasts sont de source `playlist`** : AzuraCast crée un épisode par média de la
  playlist cachée et le retire si le média disparaît. Rien n'est copié sur le disque.
  Le script ne fait qu'ajouter des adhésions de fichiers (l'union est préservée) et
  retitrer les épisodes depuis l'archive (sujet, extrait, source, date de diffusion).
* **On publie ce qui a été diffusé**, jamais ce qui a seulement été produit.
* **L'antenne anglaise** n'a pas de page publique AzuraCast (`/api/nowplaying/2` = 404) :
  l'app lit le statut Icecast (`:8010/status-json.xsl`, public, CORS) en repli — titre et
  artiste, sans pochette ni « à suivre ».
* **Les vidéos** : flux RSS de la chaîne YouTube (15 dernières) + détection film / Short
  par la redirection de `/shorts/<id>`, mémoire dans `data/videos.json`. Affichés : les
  cinq films de Marvin publiés en Short (`data/marvin-shorts.json`) et tout film long
  publié depuis le 01/09/2026.

## Développer

```bash
npm install
npm run assets     # icônes + pochettes (sharp) depuis brand/logo.png
npm run videos     # public/videos.json depuis YouTube
npm run dev        # http://localhost:5173/la-radio-app/
npm run build      # dist/ (PWA, service worker)
```

`VITE_BASE=/ npm run build` pour servir l'app à la racine d'un domaine (app.la-radio.ai).

## Ce qui n'est pas fait

* Pas d'app native : le Mac n'a pas Xcode. La PWA couvre iPhone et Android ; un emballage
  Capacitor (Android APK via GitHub Actions, iOS via un compte développeur Apple) est
  décrit dans `HANDOFF.md`.
* Pas de notifications.
* Les flux RSS ne sont pas encore soumis à Apple Podcasts / Spotify (voir `HANDOFF.md`).
