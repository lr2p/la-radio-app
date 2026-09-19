# Handoff — l'app La Radio AI (19/09/2026)

> À lire avant de reprendre. Le README dit comment ça marche ; ce document dit **où on en
> est**, **ce qui n'est pas prouvé**, **par quoi continuer** et **comment revenir en arrière**.

## Où on en est

| Brique | État | Vérifié comment |
|---|---|---|
| Podcasts AzuraCast (16, FR + EN, 596 épisodes) | **en production** | `GET /api/station/1/public/podcasts`, flux RSS lus, MP3 publics en 206 + CORS |
| `podcasts-sync.py` + cron VPS 15 min | **déployé** (`/opt/la-radio/bin/`, `/etc/cron.d/la-radio-podcasts-sync`) | deux passages réels : 400 + 196 ajouts, 596 retitrages, 0 fichier absent |
| L'app (PWA) | **construite et testée en local** (Chrome headless mobile, toutes les pages, lecture d'un épisode, direct EN) | `npm run build` + `vite preview` + Playwright |
| Publication GitHub Pages | **bloquée** : la session n'a pas pu créer le dépôt ni committer (permission git refusée par le bac à sable) | — |
| Emballage store (Capacitor) | pas commencé | — |

## ⬅️ Par quoi reprendre

1. **Publier.** Dans `~/dev/la-radio-app` : `git init && git add -A && git commit`, puis
   `gh repo create lr2p/la-radio-app --public --source=. --push` et activer Pages en mode
   « GitHub Actions » (`gh api -X POST repos/lr2p/la-radio-app/pages -f build_type=workflow`).
   Le workflow `deploy.yml` fait le reste ; l'app sort sur
   `https://lr2p.github.io/la-radio-app/`. Le dépôt doit être **public** (Pages gratuit).
2. **Installer sur un téléphone** et écouter : direct FR, direct EN, un épisode, écran
   verrouillé (Media Session), reprise d'un épisode. C'est la seule vérification qui compte
   et elle n'a pas été faite — le Mac n'a pas de téléphone.
3. **Un domaine** : `app.la-radio.ai` en CNAME vers `lr2p.github.io`, fichier `public/CNAME`,
   et `VITE_BASE=/` dans le workflow.
4. **Soumettre les flux** (Apple Podcasts Connect, Spotify for Podcasters, Deezer) : les
   URL sont `https://stream.la-radio.ai/public/1/podcast/<id>/feed`, liste par l'API
   publique. Apple exige une catégorie iTunes : le champ `categories` du podcast est vide,
   à poser via `PUT /station/1/podcast/<id>` (`"categories": ["News", "Music|Music History"]`)
   — à tester, le format n'a pas été vérifié.
5. **L'emballage store**, quand un compte Apple Developer et un compte Google Play
   existent : `npm i @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios`,
   `npx cap init "La Radio AI" ai.laradio.app --web-dir dist`, un workflow GitHub Actions
   (macOS runner = Xcode) pour signer et livrer. Rien de tout ça n'est écrit.

## Ce qui a été décidé, et pourquoi

- **Podcasts de source `playlist`** (AzuraCast 0.23.2) plutôt qu'épisodes uploadés : zéro
  copie de média (le VPS avait 6,8 Go libres), et AzuraCast retire l'épisode si le fichier
  disparaît. Les playlists « Podcast · X » sont `default`, **désactivées**, hors requêtes
  et hors on-demand — le profil de la « Bibliothèque ». Elles ne passent jamais à l'antenne.
- **Tout sur la station 1**, même l'anglais : la page publique de la station 2 est fermée
  (`/api/station/2/public/podcasts` → 404). Le catalogue est commun aux deux antennes.
- **On publie ce qui a été diffusé** (`diffusion-*.jsonl`), pas ce qui a été produit :
  22 productions d'août sur 28 n'étaient jamais passées à l'antenne.
- **Le retitrage vit dans le script**, pas dans l'app : le flux RSS (Apple, Spotify) doit
  lui aussi avoir de vrais titres. L'app garde un formateur de secours (`prettyTitle`).
- **Pas de nowplaying anglais par AzuraCast** : plutôt que d'activer la page publique de
  la station 2 (changement de production non demandé), l'app lit le statut Icecast.
  Si un jour la page publique est ouverte, l'app la préférera d'elle-même.
- **Charlotte News FR** (16 anciens bulletins) n'est pas un podcast : hors catalogue.

## Ce qui n'est pas prouvé

- **iPhone, écran verrouillé.** Une PWA iOS continue l'audio en arrière-plan, mais la
  fiabilité des commandes de l'écran verrouillé varie selon la version d'iOS. À écouter
  en vrai. Le remède définitif est l'app native (point 5).
- **La tâche AzuraCast se déclenche-t-elle seule ?** Elle est planifiée toutes les 10 min
  (`CheckPodcastPlaylistsTask`) mais le premier test n'avait rien produit après 20 min ; le
  script la force donc après chaque ajout (`docker exec azuracast azuracast_cli
  azuracast:sync:task …`). À surveiller dans `/opt/la-radio/state/podcasts-sync.log` : si
  un nouvel épisode n'apparaît qu'au passage suivant, c'est elle qui ne tourne pas.
- **Le recensement YouTube depuis GitHub Actions** : la détection film/Short passe par la
  redirection de `/shorts/<id>` avec un cookie de consentement ; validée depuis le Mac,
  pas depuis un runner. En cas de mur de consentement le script garde la mémoire et
  réessaie le lendemain — l'app ne casse pas.

## Retour arrière

- Couper l'alimentation : `touch /opt/la-radio/state/podcasts-sync.DISABLED`.
- Supprimer les podcasts : `DELETE /api/station/1/podcast/<id>` (16 fois) ; les playlists
  « Podcast · X » : `DELETE /api/station/1/playlist/<id>` — les fichiers restent dans la
  médiathèque et dans leurs playlists d'antenne (le script n'a fait qu'ajouter une adhésion).
- Rejouer de zéro : effacer `/opt/la-radio/state/podcasts-sync.json` et relancer ; le script
  est idempotent (il retrouve podcasts par `link` et playlists par nom).

## Les pièges payés

- `POST /podcasts` exige `explicit` (500 « Column 'explicit' cannot be null » sinon).
- Le titre d'un épisode créé par AzuraCast est le tag `title` du MP3
  (« La_Question_2026-09-05 »), sa description artiste/album/paroles. D'où le retitrage.
- `/api/station/2/…/public/…` répond « Station non trouvée » : ce n'est pas un bug d'URL.
- Les fichiers de Richard et de Hell No mélangent FR et EN dans un même dossier : une
  playlist « par dossier » aurait mélangé les langues, c'est pour ça que la source est
  l'archive de diffusion (nom de playlist → émission + langue), pas les dossiers.
