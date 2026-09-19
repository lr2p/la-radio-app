import { useEffect, useState } from 'react';
import { NOWPLAYING_INTERVAL_MS, STATIONS, type StationId } from '../config';
import { fetchNowPlaying, type NowPlaying } from '../lib/api';
import { useSettings } from '../lib/settings';
import { usePlayer } from '../player/PlayerContext';
import { Pause, Play, Spinner } from '../components/Icons';

const LOGO = `${import.meta.env.BASE_URL}brand/logo.png`;

export default function Live() {
  const { station, setStation, s } = useSettings();
  const p = usePlayer();
  const [np, setNp] = useState<NowPlaying | null>(null);
  const [failed, setFailed] = useState(false);

  // Sondage du « now playing » de l'antenne affichée.
  useEffect(() => {
    let alive = true;
    let timer: number | undefined;
    const tick = async () => {
      try {
        const d = await fetchNowPlaying(station);
        if (!alive) return;
        setNp(d);
        setFailed(false);
      } catch {
        if (alive) setFailed(true);
      } finally {
        if (alive) timer = window.setTimeout(tick, NOWPLAYING_INTERVAL_MS);
      }
    };
    setNp(null);
    tick();
    return () => {
      alive = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [station]);

  // Le lecteur (écran verrouillé) suit le titre de l'antenne qu'il joue.
  useEffect(() => {
    if (p.track?.kind === 'live' && np && np.station === p.track.station) p.setLiveSong(np.song);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [np, p.track]);

  const playingThis = p.track?.kind === 'live' && p.track.station === station;
  const isPlaying = playingThis && (p.status === 'playing' || p.status === 'loading');
  const st = STATIONS[station];
  const art = np?.song.art ?? LOGO;

  const onMain = () => {
    if (isPlaying) p.pause();
    else p.playLive(station);
  };

  return (
    <main className="page live">
      <div className="segmented" role="tablist" aria-label={s.live.station}>
        {(Object.keys(STATIONS) as StationId[]).map((id) => (
          <button key={id} role="tab" aria-selected={station === id} className={station === id ? 'on' : ''} onClick={() => setStation(id)}>
            {STATIONS[id].label}
          </button>
        ))}
      </div>

      <section className="hero">
        <div className={`art-wrap${isPlaying && p.status === 'playing' ? ' playing' : ''}`}>
          <img src={art} alt="" className="hero-art" onError={(e) => ((e.currentTarget as HTMLImageElement).src = LOGO)} />
        </div>
        <div className="hero-badge">
          <span className="dot" />
          {s.live.nowPlaying}
          {np?.playlist && !/^default$/i.test(np.playlist) ? ` · ${np.playlist}` : ''}
        </div>
        <h1 className="hero-title">{np?.song.title || (failed ? s.live.unavailable : st.name)}</h1>
        <div className="hero-artist">{np?.song.artist || (np ? st.name : '')}</div>

        <button className={`bigplay${isPlaying ? ' on' : ''}`} onClick={onMain} aria-label={isPlaying ? s.live.pause : s.live.play}>
          {playingThis && p.status === 'loading' ? <Spinner size={38} /> : isPlaying ? <Pause size={38} /> : <Play size={38} />}
        </button>
        <div className="hero-hint">
          {playingThis && p.status === 'error'
            ? s.player.error
            : playingThis && p.status === 'loading'
              ? s.live.loading
              : isPlaying
                ? st.name
                : s.live.play}
        </div>
        {np?.listeners != null && <div className="listeners">{s.live.listeners(np.listeners)}</div>}
      </section>

      {np?.next && (
        <section className="card">
          <div className="card-label">{s.live.next}</div>
          <div className="row">
            {np.next.art && <img src={np.next.art} alt="" className="row-art" />}
            <div className="row-text">
              <div className="row-title">{np.next.title}</div>
              <div className="row-sub">{np.next.artist}</div>
            </div>
          </div>
        </section>
      )}

      {np && np.history.length > 0 && (
        <section className="card">
          <div className="card-label">{s.live.history}</div>
          {np.history.map((h, i) => (
            <div className="row" key={`${h.title}-${i}`}>
              {h.art ? <img src={h.art} alt="" className="row-art" /> : <div className="row-art placeholder" />}
              <div className="row-text">
                <div className="row-title">{h.title}</div>
                <div className="row-sub">{h.artist}</div>
              </div>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
