import { PODCASTS_API, STATIONS, type Lang, type StationId } from '../config';
import { slugFromLink } from '../shows';

// ---------------------------------------------------------------------------
// Direct
// ---------------------------------------------------------------------------
export interface Song {
  title: string;
  artist: string;
  art: string | null;
}

export interface NowPlaying {
  station: StationId;
  song: Song;
  /** Nom de la playlist AzuraCast qui joue (émission ou tranche musicale). */
  playlist: string | null;
  next: Song | null;
  history: Song[];
  listeners: number | null;
  isLive: boolean;
  elapsed: number | null;
  duration: number | null;
  /** Source de l'information : l'API complète, ou le statut Icecast (anglais). */
  source: 'azuracast' | 'icecast';
}

function song(s: { title?: string; artist?: string; art?: string | null; text?: string } | undefined | null): Song {
  const title = (s?.title ?? '').trim();
  const artist = (s?.artist ?? '').trim();
  if (!title && s?.text) {
    const [a, ...rest] = s.text.split(' - ');
    return rest.length ? { title: rest.join(' - '), artist: a, art: s?.art ?? null } : { title: s.text, artist: '', art: s?.art ?? null };
  }
  return { title, artist, art: s?.art ?? null };
}

function cleanArt(url: string | null | undefined): string | null {
  if (!url) return null;
  // L'API renvoie parfois l'image générique d'AzuraCast : on la traite comme « pas d'image ».
  if (/generic_song/.test(url)) return null;
  return url.replace(/^http:\/\/46\.225\.163\.238\//, 'https://stream.la-radio.ai/');
}

async function fetchJson<T>(url: string, timeoutMs = 10_000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

interface AzNowPlaying {
  now_playing?: { song?: { title: string; artist: string; art: string; text: string }; playlist?: string; elapsed?: number; duration?: number };
  playing_next?: { song?: { title: string; artist: string; art: string; text: string }; playlist?: string } | null;
  song_history?: { song?: { title: string; artist: string; art: string; text: string } }[];
  listeners?: { current?: number; unique?: number };
  live?: { is_live?: boolean };
}

interface IcecastStatus {
  icestats?: { source?: IcecastSource | IcecastSource[] };
}
interface IcecastSource {
  title?: string;
  artist?: string;
  listeners?: number;
  listenurl?: string;
  server_name?: string;
}

export async function fetchNowPlaying(id: StationId): Promise<NowPlaying> {
  const st = STATIONS[id];
  try {
    if (!st.nowplayingPublic) throw new Error('nowplaying fermé');
    const d = await fetchJson<AzNowPlaying>(st.nowplaying, 8000);
    const np = d.now_playing;
    return {
      station: id,
      song: { ...song(np?.song), art: cleanArt(np?.song?.art) },
      playlist: np?.playlist || null,
      next: d.playing_next?.song ? { ...song(d.playing_next.song), art: cleanArt(d.playing_next.song.art) } : null,
      history: (d.song_history ?? []).slice(0, 8).map((h) => ({ ...song(h.song), art: cleanArt(h.song?.art) })),
      listeners: d.listeners?.unique ?? d.listeners?.current ?? null,
      isLive: Boolean(d.live?.is_live),
      elapsed: np?.elapsed ?? null,
      duration: np?.duration ?? null,
      source: 'azuracast',
    };
  } catch (e) {
    if (!st.icecast) throw e;
  }
  // Repli : le statut Icecast (toujours public). Titre + artiste, sans image ni suite.
  const ice = await fetchJson<IcecastStatus>(st.icecast!, 8000);
  const raw = ice.icestats?.source;
  const sources = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const src = sources.find((s) => (s.listenurl ?? '').includes('airia')) ?? sources[0];
  return {
    station: id,
    song: song({ title: src?.title ?? '', artist: src?.artist ?? '', art: null }),
    playlist: null,
    next: null,
    history: [],
    listeners: typeof src?.listeners === 'number' ? src.listeners : null,
    isLive: false,
    elapsed: null,
    duration: null,
    source: 'icecast',
  };
}

// ---------------------------------------------------------------------------
// Podcasts (API publique d'AzuraCast, station 1)
// ---------------------------------------------------------------------------
export interface Podcast {
  id: string;
  slug: string;
  title: string;
  description: string;
  lang: Lang;
  episodes: number;
  art: string;
  feed: string;
  publicUrl: string;
}

export interface Episode {
  id: string;
  podcastId: string;
  title: string;
  description: string;
  publishedAt: number; // secondes epoch
  url: string;
  art: string | null;
  /** Durée en secondes si connue (l'API publique ne la donne pas toujours). */
  duration: number | null;
}

interface AzPodcast {
  id: string;
  title: string;
  link: string | null;
  description: string;
  language: string;
  episodes: number;
  is_published: boolean;
  art: string;
  links: { public_feed?: string; public_episodes?: string };
}

interface AzEpisode {
  id: string;
  title: string;
  description: string;
  publish_at: number;
  is_published: boolean;
  has_media: boolean;
  has_custom_art: boolean;
  art?: string;
  media?: { length?: number } | null;
  playlist_media?: { title?: string; artist?: string; art?: string; length?: number } | null;
  links: { download?: string; media?: string };
}

export async function fetchPodcasts(): Promise<Podcast[]> {
  const list = await fetchJson<AzPodcast[]>(`${PODCASTS_API}/podcasts`);
  return list
    .filter((p) => p.is_published !== false)
    .map((p) => ({
      id: p.id,
      slug: slugFromLink(p.link, p.title),
      title: p.title,
      description: p.description ?? '',
      lang: (p.language ?? 'fr').toLowerCase().startsWith('en') ? 'en' : 'fr',
      episodes: p.episodes ?? 0,
      art: p.art,
      feed: p.links?.public_feed ?? '',
      publicUrl: p.links?.public_episodes ?? '',
    }));
}

export async function fetchEpisodes(podcastId: string): Promise<Episode[]> {
  const list = await fetchJson<AzEpisode[]>(`${PODCASTS_API}/podcast/${podcastId}/episodes`);
  return list
    .filter((e) => e.has_media && e.links?.download)
    .map((e) => ({
      id: e.id,
      podcastId,
      title: e.title,
      description: e.description ?? '',
      publishedAt: e.publish_at,
      url: e.links.download!,
      art: e.has_custom_art ? (e.art ?? null) : null,
      duration: e.media?.length ?? e.playlist_media?.length ?? null,
    }))
    .sort((a, b) => b.publishedAt - a.publishedAt);
}

// ---------------------------------------------------------------------------
// Vidéos (fichier statique régénéré chaque jour par GitHub Actions)
// ---------------------------------------------------------------------------
export interface Video {
  id: string;
  title: string;
  publishedAt: string;
  kind: 'film' | 'short';
}

export async function fetchVideos(): Promise<Video[]> {
  const d = await fetchJson<{ videos: Video[] }>(`${import.meta.env.BASE_URL}videos.json`);
  return d.videos ?? [];
}
