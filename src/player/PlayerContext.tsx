import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { STATIONS, type StationId } from '../config';
import type { Episode, Podcast, Song } from '../lib/api';

export type Track =
  | { kind: 'live'; station: StationId }
  | { kind: 'episode'; episode: Episode; podcast: Podcast; queue: Episode[] };

export type Status = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

interface PlayerState {
  track: Track | null;
  status: Status;
  position: number;
  duration: number;
  rate: number;
  /** Ce que le direct joue en ce moment (pour la Media Session et le mini-lecteur). */
  liveSong: Song | null;
}

interface PlayerApi extends PlayerState {
  playLive: (station: StationId) => void;
  playEpisode: (episode: Episode, podcast: Podcast, queue?: Episode[]) => void;
  toggle: () => void;
  pause: () => void;
  seek: (seconds: number) => void;
  skip: (delta: number) => void;
  setRate: (rate: number) => void;
  next: () => void;
  prev: () => void;
  setLiveSong: (song: Song | null) => void;
  /** Position mémorisée d'un épisode (0 si jamais écouté). */
  savedPosition: (episodeId: string) => number;
  isCurrent: (episodeId: string) => boolean;
  stop: () => void;
}

const Ctx = createContext<PlayerApi | null>(null);

const POS_KEY = (id: string) => `lra.pos.${id}`;
const RATE_KEY = 'lra.rate';

function readPos(id: string): number {
  try {
    const v = Number(localStorage.getItem(POS_KEY(id)));
    return Number.isFinite(v) && v > 0 ? v : 0;
  } catch {
    return 0;
  }
}

function writePos(id: string, pos: number, duration: number) {
  try {
    // Fin d'épisode : on oublie la position, l'épisode est « écouté ».
    if (duration > 0 && pos > duration - 20) {
      localStorage.setItem(POS_KEY(id), '-1');
    } else {
      localStorage.setItem(POS_KEY(id), String(Math.floor(pos)));
    }
  } catch {
    /* stockage indisponible : on continue sans mémoire */
  }
}

const audio: HTMLAudioElement | null = typeof Audio !== 'undefined' ? new Audio() : null;
if (audio) {
  audio.preload = 'none';
  audio.crossOrigin = null;
  audio.setAttribute('playsinline', 'true');
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [track, setTrack] = useState<Track | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [liveSong, setLiveSongState] = useState<Song | null>(null);
  const [rate, setRateState] = useState<number>(() => {
    try {
      const v = Number(localStorage.getItem(RATE_KEY));
      return v >= 0.5 && v <= 3 ? v : 1;
    } catch {
      return 1;
    }
  });
  const trackRef = useRef<Track | null>(null);
  trackRef.current = track;

  // --- Écouteurs de l'élément audio, posés une fois --------------------------
  useEffect(() => {
    if (!audio) return;
    const onPlaying = () => setStatus('playing');
    const onPause = () => {
      if (audio.ended) return;
      setStatus((s) => (s === 'idle' ? s : 'paused'));
    };
    const onWaiting = () => setStatus((s) => (s === 'paused' || s === 'idle' ? s : 'loading'));
    const onTime = () => {
      const t = trackRef.current;
      setPosition(audio.currentTime);
      if (t?.kind === 'episode' && Number.isFinite(audio.duration)) {
        setDuration(audio.duration);
        if (Math.floor(audio.currentTime) % 5 === 0) writePos(t.episode.id, audio.currentTime, audio.duration);
      }
    };
    const onMeta = () => {
      if (Number.isFinite(audio.duration)) setDuration(audio.duration);
    };
    const onEnded = () => {
      const t = trackRef.current;
      if (t?.kind === 'episode') {
        writePos(t.episode.id, audio.duration || 0, audio.duration || 0);
        const i = t.queue.findIndex((e) => e.id === t.episode.id);
        const nextEp = i >= 0 ? t.queue[i + 1] : undefined;
        if (nextEp) {
          startEpisode(nextEp, t.podcast, t.queue);
          return;
        }
      }
      setStatus('paused');
    };
    const onError = () => {
      if (!audio.src) return;
      setStatus('error');
    };
    audio.addEventListener('playing', onPlaying);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('durationchange', onMeta);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    return () => {
      audio.removeEventListener('playing', onPlaying);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('durationchange', onMeta);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Démarrages ----------------------------------------------------------
  const startLive = useCallback((station: StationId) => {
    if (!audio) return;
    const st = STATIONS[station];
    setTrack({ kind: 'live', station });
    setPosition(0);
    setDuration(0);
    setStatus('loading');
    audio.playbackRate = 1;
    // Un paramètre unique force une connexion neuve : jamais de tampon périmé.
    audio.src = `${st.stream}?app=${Date.now()}`;
    audio.load();
    audio.play().catch(() => setStatus('error'));
  }, []);

  const startEpisode = useCallback((episode: Episode, podcast: Podcast, queue: Episode[] = []) => {
    if (!audio) return;
    setTrack({ kind: 'episode', episode, podcast, queue });
    setStatus('loading');
    setDuration(episode.duration ?? 0);
    const from = readPos(episode.id);
    setPosition(from > 0 ? from : 0);
    audio.src = episode.url;
    audio.load();
    audio.playbackRate = rate;
    const seekThenPlay = () => {
      if (from > 0) {
        try {
          audio.currentTime = from;
        } catch {
          /* pas encore possible : on jouera du début */
        }
      }
      audio.play().catch(() => setStatus('error'));
    };
    if (from > 0) {
      audio.addEventListener('loadedmetadata', seekThenPlay, { once: true });
      // iOS ne déclenche pas toujours loadedmetadata avant play() : on lance quand même.
      audio.play().catch(() => undefined);
    } else {
      seekThenPlay();
    }
  }, [rate]);

  const playLive = useCallback(
    (station: StationId) => {
      const t = trackRef.current;
      if (t?.kind === 'live' && t.station === station && audio && !audio.paused) return;
      startLive(station);
    },
    [startLive],
  );

  const playEpisode = useCallback(
    (episode: Episode, podcast: Podcast, queue?: Episode[]) => {
      const t = trackRef.current;
      if (t?.kind === 'episode' && t.episode.id === episode.id && audio) {
        if (audio.paused) audio.play().catch(() => setStatus('error'));
        return;
      }
      startEpisode(episode, podcast, queue ?? [episode]);
    },
    [startEpisode],
  );

  const pause = useCallback(() => {
    if (!audio) return;
    const t = trackRef.current;
    if (t?.kind === 'live') {
      // Un direct ne se met pas en pause : on coupe le flux pour arrêter de télécharger.
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      setStatus('paused');
      return;
    }
    if (t?.kind === 'episode') writePos(t.episode.id, audio.currentTime, audio.duration || 0);
    audio.pause();
  }, []);

  const toggle = useCallback(() => {
    if (!audio) return;
    const t = trackRef.current;
    if (!t) return;
    if (status === 'playing' || status === 'loading') {
      pause();
      return;
    }
    if (t.kind === 'live') startLive(t.station);
    else {
      setStatus('loading');
      audio.play().catch(() => setStatus('error'));
    }
  }, [status, pause, startLive]);

  const seek = useCallback((seconds: number) => {
    if (!audio || trackRef.current?.kind !== 'episode') return;
    const d = audio.duration || duration || 0;
    const target = Math.max(0, d ? Math.min(seconds, d - 0.5) : seconds);
    try {
      audio.currentTime = target;
      setPosition(target);
    } catch {
      /* ignoré */
    }
  }, [duration]);

  const skip = useCallback((delta: number) => seek((audio?.currentTime ?? 0) + delta), [seek]);

  const setRate = useCallback((r: number) => {
    setRateState(r);
    try {
      localStorage.setItem(RATE_KEY, String(r));
    } catch {
      /* ignoré */
    }
    if (audio && trackRef.current?.kind === 'episode') audio.playbackRate = r;
  }, []);

  const step = useCallback(
    (dir: 1 | -1) => {
      const t = trackRef.current;
      if (t?.kind !== 'episode') return;
      const i = t.queue.findIndex((e) => e.id === t.episode.id);
      const target = i >= 0 ? t.queue[i + dir] : undefined;
      if (target) startEpisode(target, t.podcast, t.queue);
    },
    [startEpisode],
  );
  const next = useCallback(() => step(1), [step]);
  const prev = useCallback(() => step(-1), [step]);

  const stop = useCallback(() => {
    if (!audio) return;
    pause();
    setTrack(null);
    setStatus('idle');
  }, [pause]);

  const setLiveSong = useCallback((s: Song | null) => setLiveSongState(s), []);

  // --- Media Session (écran verrouillé, écouteurs, voiture) -------------------
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    if (!track) {
      ms.metadata = null;
      return;
    }
    if (track.kind === 'live') {
      const st = STATIONS[track.station];
      ms.metadata = new MediaMetadata({
        title: liveSong?.title || st.name,
        artist: liveSong?.artist || (track.station === 'fr' ? 'En direct' : 'Live'),
        album: st.name,
        artwork: liveSong?.art
          ? [{ src: liveSong.art, sizes: '512x512', type: 'image/jpeg' }]
          : [{ src: new URL('icons/icon-512.png', document.baseURI).href, sizes: '512x512', type: 'image/png' }],
      });
    } else {
      ms.metadata = new MediaMetadata({
        title: track.episode.title,
        artist: track.podcast.title,
        album: 'La Radio AI',
        artwork: [{ src: track.episode.art ?? track.podcast.art, sizes: '512x512', type: 'image/png' }],
      });
    }
  }, [track, liveSong]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    const set = (a: MediaSessionAction, h: MediaSessionActionHandler | null) => {
      try {
        ms.setActionHandler(a, h);
      } catch {
        /* action non supportée */
      }
    };
    set('play', () => toggle());
    set('pause', () => pause());
    set('stop', () => stop());
    if (track?.kind === 'episode') {
      set('seekbackward', (d) => skip(-(d.seekOffset ?? 15)));
      set('seekforward', (d) => skip(d.seekOffset ?? 30));
      set('seekto', (d) => (d.seekTime != null ? seek(d.seekTime) : undefined));
      set('nexttrack', () => next());
      set('previoustrack', () => prev());
    } else {
      set('seekbackward', null);
      set('seekforward', null);
      set('seekto', null);
      set('nexttrack', null);
      set('previoustrack', null);
    }
  }, [track, toggle, pause, stop, skip, seek, next, prev]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.playbackState = status === 'playing' ? 'playing' : status === 'paused' ? 'paused' : 'none';
      if (track?.kind === 'episode' && duration > 0 && position <= duration) {
        navigator.mediaSession.setPositionState({ duration, position, playbackRate: rate });
      }
    } catch {
      /* ignoré */
    }
  }, [status, position, duration, rate, track]);

  const value = useMemo<PlayerApi>(
    () => ({
      track,
      status,
      position,
      duration,
      rate,
      liveSong,
      playLive,
      playEpisode,
      toggle,
      pause,
      seek,
      skip,
      setRate,
      next,
      prev,
      setLiveSong,
      savedPosition: readPos,
      isCurrent: (id: string) => track?.kind === 'episode' && track.episode.id === id,
      stop,
    }),
    [track, status, position, duration, rate, liveSong, playLive, playEpisode, toggle, pause, seek, skip, setRate, next, prev, setLiveSong, stop],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePlayer(): PlayerApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePlayer hors PlayerProvider');
  return v;
}
