// Recense les vidéos de la chaîne YouTube et écrit public/videos.json.
//   node scripts/videos.mjs                       le recensement complet (toutes les 2 h)
//   node scripts/videos.mjs <url ou id YouTube>   + une vidéo nommée, sans attendre le flux RSS
//
// La deuxième forme est le chemin de la publication immédiate : le studio de Marvin
// « sonne » ce dépôt quand Leeroy y colle le lien YouTube d'un film, et l'app est à jour
// dans la minute. Le flux RSS peut mettre du temps à voir une vidéo fraîche ; une vidéo
// nommée est donc lue directement sur sa page /watch. Une vidéo encore NON RÉPERTORIÉE
// est laissée de côté : c'est le recensement des deux heures qui la prendra, publique.
//
// Sources, toutes publiques et sans clé :
//   * le flux RSS de la chaîne (les 15 dernières vidéos, titre + date) ;
//   * la « redirection des Shorts » : /shorts/<id> répond 200 pour un Short et 303
//     vers /watch pour une vraie vidéo — c'est ainsi qu'on sépare le format 9:16 du 16:9 ;
//   * la page /watch : durée (« lengthSeconds »), titre, date et « non répertoriée ».
// Ce que YouTube ne redonne plus (au-delà des 15 dernières) est conservé dans
// data/videos.json, la mémoire du recensement, commitée par le workflow.
//
// Règle d'affichage : les films de Marvin, et rien d'autre. Ce qui les distingue
// n'est pas leur format — beaucoup sont publiés en 9:16 et YouTube les classe donc
// en Shorts — mais leur durée : un film de Marvin dure deux à trois minutes, les
// shorts de promotion de Richard moins d'une minute. Donc : tout ce qui est publié
// depuis le 1er septembre 2026 et dure au moins 90 secondes. Les trois vidéos longues
// de 2025 (avant Marvin) restent hors de l'app.
//
// Deuxième chaîne, Live.LaRadioAI : le Journal Vidéo y publie La Matinale et Le Débrief
// en films (Justine & Jérémy). Chaque vidéo y est rangée par sa série, lue dans son titre
// et sa description (« La Matinale de La Radio AI — … ») ; ce qui n'est ni l'un ni l'autre
// (le direct 24/7, par exemple) reste dehors. Le champ `series` de videos.json dit
// d'où vient chaque vidéo : marvin, matinale ou debrief.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const CHANNEL_ID = 'UCixrn6xPgobbRB_ECoFR6tQ';
const JOURNAL_CHANNEL_ID = 'UCrPMGr91b5ZoxHIrNLWNWKQ';
const SINCE = '2026-09-01';
const MIN_SECONDS = 90;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36';
const COOKIE = 'CONSENT=YES+cb.20240101-01-p0.en+FX+000; SOCS=CAI';

async function readJson(p, fallback) {
  try {
    return JSON.parse(await readFile(p, 'utf8'));
  } catch {
    return fallback;
  }
}

async function rss(channel = CHANNEL_ID) {
  const r = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channel}`, { headers: { 'user-agent': UA } });
  if (!r.ok) throw new Error(`RSS ${r.status}`);
  const xml = await r.text();
  const out = [];
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const e = m[1];
    const id = /<yt:videoId>([^<]+)/.exec(e)?.[1];
    const title = /<title>([^<]*)/.exec(e)?.[1] ?? '';
    const published = /<published>([^<]+)/.exec(e)?.[1] ?? '';
    if (id) out.push({ id, title: decode(title), publishedAt: published.slice(0, 10) });
  }
  return out;
}

function decode(s) {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

async function isShort(id) {
  const r = await fetch(`https://www.youtube.com/shorts/${id}`, {
    method: 'HEAD',
    redirect: 'manual',
    headers: { 'user-agent': UA, cookie: COOKIE },
  });
  if (r.status === 200) return true;
  if (r.status >= 300 && r.status < 400) {
    const loc = r.headers.get('location') ?? '';
    if (/consent\.youtube\.com/.test(loc)) return null; // pas tranché : mur de consentement
    return false;
  }
  return null;
}

// Ce que la page /watch dit d'une vidéo, ou null si elle est illisible (on réessaiera
// au prochain passage). Un seul chargement sert à la durée ET, pour une vidéo nommée
// que le flux RSS ne donne pas encore, à son titre, sa date et son statut.
async function fiche(id) {
  try {
    const r = await fetch(`https://www.youtube.com/watch?v=${id}`, { headers: { 'user-agent': UA, cookie: COOKIE } });
    if (!r.ok) return null;
    const h = await r.text();
    const sec = /"lengthSeconds":"(\d+)"/.exec(h);
    if (!sec) return null;
    return {
      seconds: Number(sec[1]),
      title: decode(/playerMicroformatRenderer":\{"thumbnail[\s\S]{0,400}?"title":\{"simpleText":"([^"]+)"/.exec(h)?.[1] ?? ''),
      publishedAt: /"publishDate":\{?"?(?:simpleText":")?([0-9-]{10})/.exec(h)?.[1] ?? '',
      cachee: /"isUnlisted":true/.test(h) || /"isPrivate":true/.test(h),
      direct: /"isLiveContent":true/.test(h),
      description: JSON.parse(`"${/"shortDescription":"((?:[^"\\]|\\.)*)"/.exec(h)?.[1] ?? ''}"`),
    };
  } catch {
    return null;
  }
}

// La série d'une vidéo du Journal : celle des deux émissions nommée en premier.
function serieJournal(texte) {
  const m = texte.search(/matinale/i);
  const d = texte.search(/d[ée]brief/i);
  if (m < 0 && d < 0) return null;
  if (d < 0) return 'matinale';
  if (m < 0) return 'debrief';
  return m < d ? 'matinale' : 'debrief';
}

// `id` accepte une URL collée (watch, shorts, youtu.be) aussi bien qu'un identifiant nu.
function idNomme(valeur) {
  return /(?:youtu\.be\/|\/(?:watch\?v=|shorts\/|live\/|embed\/))([A-Za-z0-9_-]{11})/.exec(valeur)?.[1]
    ?? (/^[A-Za-z0-9_-]{11}$/.test(valeur.trim()) ? valeur.trim() : null);
}

async function main() {
  const memoryPath = path.join(root, 'data', 'videos.json');
  const memory = await readJson(memoryPath, { videos: [] });
  const byId = new Map(memory.videos.map((v) => [v.id, v]));

  let feed = [];
  try {
    feed = await rss();
  } catch (e) {
    console.error('RSS indisponible, on garde la mémoire :', e.message);
  }

  // Les vidéos nommées en argument que le flux ne donne pas (encore) : lues sur leur page.
  const vues = new Set(feed.map((v) => v.id));
  for (const arg of process.argv.slice(2)) {
    const id = idNomme(arg);
    if (!id) {
      console.error('ni une URL YouTube ni un identifiant :', arg);
      continue;
    }
    if (vues.has(id)) continue;
    const f = await fiche(id);
    if (!f || !f.publishedAt) {
      console.error('page illisible, le recensement la trouvera :', id);
      continue;
    }
    if (f.cachee) {
      console.error('pas encore publique, on ne la montre pas :', id, f.title);
      continue;
    }
    feed.push({ id, title: f.title, publishedAt: f.publishedAt, seconds: f.seconds });
  }

  for (const v of feed) {
    const prev = byId.get(v.id) ?? {};
    let kind = prev.kind;
    if (!kind) {
      const s = await isShort(v.id);
      if (s === null) {
        console.error('indécis, on réessaiera :', v.id, v.title);
        continue;
      }
      kind = s ? 'short' : 'film';
    }
    // La durée ne sert qu'à trancher dans la fenêtre d'affichage : inutile de la
    // chercher pour les vidéos d'avant Marvin, et on ne la cherche qu'une fois.
    const dur =
      v.seconds ?? (v.publishedAt >= SINCE ? prev.seconds ?? (await fiche(v.id))?.seconds ?? null : prev.seconds ?? null);
    byId.set(v.id, { id: v.id, title: v.title, publishedAt: v.publishedAt, kind, seconds: dur });
  }

  // Le Journal Vidéo : sa série se lit une fois sur la page, puis vit dans la mémoire.
  let journal = [];
  try {
    journal = await rss(JOURNAL_CHANNEL_ID);
  } catch (e) {
    console.error('RSS du Journal indisponible, on garde la mémoire :', e.message);
  }
  for (const v of journal) {
    if (byId.has(v.id)) continue;
    const f = await fiche(v.id);
    if (!f) {
      console.error('page du Journal illisible, on réessaiera :', v.id, v.title);
      continue;
    }
    if (f.cachee || f.direct || !f.seconds) continue;
    const series = serieJournal(`${v.title}\n${f.description}`);
    if (!series) continue;
    byId.set(v.id, { id: v.id, title: v.title, publishedAt: v.publishedAt, kind: 'film', seconds: f.seconds, series });
  }

  const all = [...byId.values()].sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
  await mkdir(path.dirname(memoryPath), { recursive: true });
  // La mémoire n'est réécrite que si la liste change : sinon le workflow committerait chaque jour.
  if (JSON.stringify(memory.videos ?? []) !== JSON.stringify(all)) {
    await writeFile(memoryPath, JSON.stringify({ updatedAt: new Date().toISOString(), videos: all }, null, 2) + '\n');
  }

  // Durée inconnue (page illisible) : on retombe sur le format, un 16:9 étant toujours un film.
  const shown = all
    .filter((v) => v.series || (v.publishedAt >= SINCE && (v.seconds == null ? v.kind === 'film' : v.seconds >= MIN_SECONDS)))
    .map(({ id, title, publishedAt, kind, series }) => ({ id, title, publishedAt, kind, series: series ?? 'marvin' }));
  await mkdir(path.join(root, 'public'), { recursive: true });
  await writeFile(
    path.join(root, 'public', 'videos.json'),
    JSON.stringify({ updatedAt: new Date().toISOString(), channel: CHANNEL_ID, journalChannel: JOURNAL_CHANNEL_ID, videos: shown }, null, 2) + '\n',
  );
  console.log(`${all.length} vidéos connues, ${shown.length} affichées`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
