// Recense les vidéos de la chaîne YouTube et écrit public/videos.json.
//   node scripts/videos.mjs
//
// Sources, toutes publiques et sans clé :
//   * le flux RSS de la chaîne (les 15 dernières vidéos, titre + date) ;
//   * la « redirection des Shorts » : /shorts/<id> répond 200 pour un Short et 303
//     vers /watch pour une vraie vidéo — c'est ainsi qu'on sépare le format 9:16 du 16:9 ;
//   * la durée, lue dans la page /watch (« lengthSeconds »).
// Ce que YouTube ne redonne plus (au-delà des 15 dernières) est conservé dans
// data/videos.json, la mémoire du recensement, commitée par le workflow.
//
// Règle d'affichage : les films de Marvin, et rien d'autre. Ce qui les distingue
// n'est pas leur format — beaucoup sont publiés en 9:16 et YouTube les classe donc
// en Shorts — mais leur durée : un film de Marvin dure deux à trois minutes, les
// shorts de promotion de Richard moins d'une minute. Donc : tout ce qui est publié
// depuis le 1er septembre 2026 et dure au moins 90 secondes. Les trois vidéos longues
// de 2025 (avant Marvin) restent hors de l'app.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const CHANNEL_ID = 'UCixrn6xPgobbRB_ECoFR6tQ';
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

async function rss() {
  const r = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`, { headers: { 'user-agent': UA } });
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

// Durée en secondes, ou null si la page ne la donne pas (on réessaiera au prochain passage).
async function seconds(id) {
  try {
    const r = await fetch(`https://www.youtube.com/watch?v=${id}`, { headers: { 'user-agent': UA, cookie: COOKIE } });
    if (!r.ok) return null;
    const m = /"lengthSeconds":"(\d+)"/.exec(await r.text());
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
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
    const dur = v.publishedAt >= SINCE ? prev.seconds ?? (await seconds(v.id)) : (prev.seconds ?? null);
    byId.set(v.id, { id: v.id, title: v.title, publishedAt: v.publishedAt, kind, seconds: dur });
  }

  const all = [...byId.values()].sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
  await mkdir(path.dirname(memoryPath), { recursive: true });
  // La mémoire n'est réécrite que si la liste change : sinon le workflow committerait chaque jour.
  if (JSON.stringify(memory.videos ?? []) !== JSON.stringify(all)) {
    await writeFile(memoryPath, JSON.stringify({ updatedAt: new Date().toISOString(), videos: all }, null, 2) + '\n');
  }

  // Durée inconnue (page illisible) : on retombe sur le format, un 16:9 étant toujours un film.
  const shown = all
    .filter((v) => v.publishedAt >= SINCE && (v.seconds == null ? v.kind === 'film' : v.seconds >= MIN_SECONDS))
    .map(({ id, title, publishedAt, kind }) => ({ id, title, publishedAt, kind }));
  await mkdir(path.join(root, 'public'), { recursive: true });
  await writeFile(
    path.join(root, 'public', 'videos.json'),
    JSON.stringify({ updatedAt: new Date().toISOString(), channel: CHANNEL_ID, videos: shown }, null, 2) + '\n',
  );
  console.log(`${all.length} vidéos connues, ${shown.length} affichées`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
