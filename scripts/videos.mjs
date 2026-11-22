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
//
// Chaque vidéo porte aussi un petit texte de présentation (`description`), tiré de sa
// description YouTube : le premier paragraphe qui dit quelque chose (ni le titre redit, ni
// la ligne de date, ni les sources, ni les hashtags) ; pour Le Débrief, son sommaire. Quand
// la description n'en donne aucun, une phrase par série tient lieu de présentation.
//   node scripts/videos.mjs --descriptions   relit, depuis le Mac, la page des vidéos qui
//                                            n'ont pas encore de texte (le runner GitHub ne
//                                            lit plus les pages /watch).
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
    const description = /<media:description>([^<]*)/.exec(e)?.[1] ?? '';
    if (id) out.push({ id, title: decode(title), publishedAt: published.slice(0, 10), description: decode(description) });
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

// Le petit texte de présentation d'une vidéo, tiré de sa description YouTube.
// Renvoie null quand la description ne dit rien de plus que le titre.
const TEASER_MAX = 220;
// Les paragraphes d'habillage du Journal : la ligne de date, la mention des voix générées…
const HABILLAGE = /laRadio\.ai est le premier média|personnages fictifs|voix .{0,20}générée|Vidéo fabriquée par|^(La Matinale|Le Débrief|Le Debrief)( de La Radio AI)?\s*(du|[—–-])\s.*\d{4}/i;
function teaser(description, title, series) {
  const norm = (s) =>
    (s || '')
      .toLowerCase()
      .replace(/#\w+/g, ' ')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  const t = norm(title);
  const paras = (description || '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  let sommaire = [];
  const puces = [];
  let sources = [];
  let candidate = null;
  for (const p of paras) {
    const lines = p.split('\n').map((l) => l.trim()).filter(Boolean);
    const head = lines[0] ?? '';
    if (/^[—–-]\s*AU SOMMAIRE/i.test(head)) {
      sommaire = lines
        .slice(1)
        .map((l) => l.replace(/^\d+:\d{2}(?::\d{2})?\s*/, '').trim())
        .filter(Boolean);
      continue;
    }
    if (/^[—–-]\s*LES SOURCES/i.test(head)) {
      sources = lines.slice(1);
      continue;
    }
    if (/^[—–-]\s*[A-ZÉ]/.test(p)) break; // « — LA NOTE DE MARVIN — » et autres rubriques
    if (/^•/.test(p)) {
      puces.push(...lines.map((l) => l.replace(/^•\s*/, '').trim()).filter(Boolean));
      continue;
    }
    if (candidate) continue;
    if (/^(🎧|#|Retrouvez )/.test(p) || /https?:\/\//.test(p) || HABILLAGE.test(p)) continue;
    const n = norm(p);
    if (!n || n === t || (t.length >= 15 && (n.includes(t) || t.includes(n)))) continue;
    candidate = p;
  }
  if (!candidate) {
    if (sommaire.length > 1) candidate = `Au sommaire : ${sommaire.join(' · ')}.`;
    else if (puces.length) candidate = puces[0];
    else if (sources.length) {
      // Un Short de La Matinale : son texte, ce sont les dépêches dont il part.
      const outlets = [...new Set(sources.map(outlet).filter(Boolean))];
      if (outlets.length) {
        candidate = `L'analyse du jour de La Matinale, en une minute, d'après ${outlets.length > 1 ? 'les dépêches de ' : 'la dépêche de '}${listeFr(outlets)}.`;
      }
    }
  }
  if (!candidate) return null;
  let s = candidate
    .replace(/\s*Sources? et note de méthode en commentaire\.?/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (s.length > TEASER_MAX) s = `${s.slice(0, TEASER_MAX).replace(/\s+\S*$/, '')}…`;
  return s || null;
}

const OUTLETS = {
  'franceinfo.fr': 'franceinfo',
  'lemonde.fr': 'Le Monde',
  'lefigaro.fr': 'Le Figaro',
  'liberation.fr': 'Libération',
  'leparisien.fr': 'Le Parisien',
  'bfmtv.com': 'BFMTV',
  'francetvinfo.fr': 'franceinfo',
  'ouest-france.fr': 'Ouest-France',
  'lesechos.fr': 'Les Échos',
  'huffingtonpost.fr': 'HuffPost',
  '20minutes.fr': '20 Minutes',
  'latribune.fr': 'La Tribune',
  'rfi.fr': 'RFI',
  'france24.com': 'France 24',
  'courrierinternational.com': 'Courrier international',
};
function outlet(line) {
  const m = /https?:\/\/(?:www\.)?([^/\s]+)/.exec(line);
  if (!m) return null;
  const host = m[1].toLowerCase();
  for (const [dom, name] of Object.entries(OUTLETS)) if (host === dom || host.endsWith(`.${dom}`)) return name;
  const base = host.split('.').slice(-2, -1)[0] ?? host;
  return base.charAt(0).toUpperCase() + base.slice(1);
}
function listeFr(items) {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} et ${items[items.length - 1]}`;
}

// À défaut de texte dans la description YouTube : une phrase par série.
function presentationParDefaut(v) {
  if (v.series === 'debrief') return 'Le bilan de la journée en trois analyses, raconté par Justine et Jérémy.';
  if (v.series === 'matinale') {
    return v.kind === 'short'
      ? "L'analyse du jour de La Matinale, en une minute."
      : "L'actualité du matin racontée par Justine et Jérémy, en vidéo.";
  }
  return 'Un disque et son histoire, racontés par Marvin, le DJ de La Radio AI.';
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

  const relireDescriptions = process.argv.includes('--descriptions');
  const args = process.argv.slice(2).filter((a) => a !== '--descriptions');

  let feed = [];
  try {
    feed = await rss();
  } catch (e) {
    console.error('RSS indisponible, on garde la mémoire :', e.message);
  }

  // Les vidéos nommées en argument que le flux ne donne pas (encore) : lues sur leur page.
  const vues = new Set(feed.map((v) => v.id));
  for (const arg of args) {
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
    feed.push({ id, title: f.title, publishedAt: f.publishedAt, seconds: f.seconds, description: f.description });
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
    const description = prev.description ?? teaser(v.description, v.title, 'marvin') ?? undefined;
    byId.set(v.id, { id: v.id, title: v.title, publishedAt: v.publishedAt, kind, seconds: dur, description });
  }

  // Le Journal Vidéo : sa série se lit une fois sur la page, puis vit dans la mémoire.
  let journal = [];
  try {
    journal = await rss(JOURNAL_CHANNEL_ID);
  } catch (e) {
    console.error('RSS du Journal indisponible, on garde la mémoire :', e.message);
  }
  //
  // Depuis le 10/10/2026, le runner GitHub reçoit une page /watch sans les données de la
  // vidéo (IP de datacenter) : plus aucune vidéo du Journal n'entrait. Quand la page est
  // illisible, on se contente du flux RSS, qui donne titre et description — de quoi lire la
  // série — et de la redirection des Shorts, qui passe toujours depuis le runner. Le flux
  // ne liste que des vidéos publiques ; seul le direct 24/7 est à écarter, par son titre.
  // Les Shorts du Journal (#Shorts, extraits de La Matinale) entrent dans l'app avec leur
  // série, rangés comme un 9:16 (kind 'short') — demande de Leeroy du 15/10/2026.
  for (const v of journal) {
    if (byId.has(v.id)) continue;
    const f = await fiche(v.id);
    if (f ? f.cachee || f.direct || !f.seconds : /\b(direct|live)\b|24\s*\/\s*7/i.test(v.title)) continue;
    const s = await isShort(v.id);
    if (s === null) {
      console.error('Journal : format indécis, on réessaiera :', v.id, v.title);
      continue;
    }
    const kind = s ? 'short' : 'film';
    const seconds = f?.seconds ?? null;
    const series = serieJournal(`${v.title}\n${f?.description ?? v.description}`);
    if (!series) continue;
    const description = teaser(f?.description || v.description, v.title, series) ?? undefined;
    byId.set(v.id, { id: v.id, title: v.title, publishedAt: v.publishedAt, kind, seconds, series, description });
  }

  // Les textes de présentation manquants, relus sur la page de chaque vidéo (depuis le Mac).
  if (relireDescriptions) {
    let lus = 0;
    for (const v of byId.values()) {
      if (v.description) continue;
      const f = await fiche(v.id);
      if (!f) {
        console.error('page illisible, pas de texte :', v.id, v.title);
        continue;
      }
      const d = teaser(f.description, v.title, v.series ?? 'marvin');
      if (d) {
        v.description = d;
        lus += 1;
      } else console.error('description muette :', v.id, v.title);
    }
    console.log(`${lus} texte(s) de présentation relu(s)`);
  }

  // Le même jour, l'ordre est fixé par l'identifiant : sans ce départage, deux vidéos du
  // même jour s'échangeaient d'un passage à l'autre et le workflow committait pour rien.
  const all = [...byId.values()].sort((a, b) =>
    a.publishedAt !== b.publishedAt ? (a.publishedAt < b.publishedAt ? 1 : -1) : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  await mkdir(path.dirname(memoryPath), { recursive: true });
  // La mémoire n'est réécrite que si la liste change : sinon le workflow committerait chaque jour.
  if (JSON.stringify(memory.videos ?? []) !== JSON.stringify(all)) {
    await writeFile(memoryPath, JSON.stringify({ updatedAt: new Date().toISOString(), videos: all }, null, 2) + '\n');
  }

  // Durée inconnue (page /watch illisible) : la vidéo est montrée. Depuis le 10/10/2026 le
  // runner GitHub ne lit plus aucune durée ; retomber sur le format, comme avant, écartait
  // tous les nouveaux films de Marvin, publiés en 9:16. Depuis le 1er septembre la chaîne
  // ne publie que ses films — si des shorts de promotion y reviennent, c'est ici qu'on
  // les verra passer.
  const shown = all
    .filter((v) =>
      v.series ? true : v.publishedAt >= SINCE && (v.seconds == null || v.seconds >= MIN_SECONDS),
    )
    .map(({ id, title, publishedAt, kind, series, description }) => {
      const v = { id, title, publishedAt, kind, series: series ?? 'marvin' };
      return { ...v, description: description ?? presentationParDefaut(v) };
    });
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
