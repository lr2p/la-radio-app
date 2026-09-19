import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { STATIONS } from '../config';
import { formatClock, prettyTitle } from '../lib/format';
import { useSettings } from '../lib/settings';
import { usePlayer } from '../player/PlayerContext';
import { Back15, ChevronDown, Fwd30, Next, Pause, Play, Prev, Spinner } from '../components/Icons';

const RATES = [0.8, 1, 1.2, 1.5, 2];

export default function Player() {
  const p = usePlayer();
  const { lang, s } = useSettings();
  const nav = useNavigate();
  const close = () => (window.history.length > 1 ? nav(-1) : nav('/'));

  const tr = p.track;
  useEffect(() => {
    if (!tr) close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tr]);
  if (!tr) return null;
  const live = tr.kind === 'live';
  const st = tr.kind === 'live' ? STATIONS[tr.station] : null;
  const art =
    tr.kind === 'live' ? p.liveSong?.art ?? `${import.meta.env.BASE_URL}brand/logo.png` : tr.episode.art ?? tr.podcast.art;
  const title = tr.kind === 'live' ? p.liveSong?.title || st!.name : prettyTitle(tr.episode.title, lang);
  const sub = tr.kind === 'live' ? p.liveSong?.artist || s.player.live : tr.podcast.title;
  const busy = p.status === 'loading';
  const on = p.status === 'playing' || busy;
  const pct = !live && p.duration > 0 ? (p.position / p.duration) * 100 : 0;

  return (
    <main className="page player">
      <button className="player-close" onClick={close} aria-label={s.player.close}>
        <ChevronDown size={28} />
      </button>
      <div className={`player-art-wrap${p.status === 'playing' ? ' playing' : ''}`}>
        <img src={art} alt="" className="player-art" />
      </div>
      <div className="player-kicker">{live ? `${s.player.live} · ${st!.name}` : sub}</div>
      <h1 className="player-title">{title}</h1>
      {live && p.liveSong?.artist && <div className="player-sub">{p.liveSong.artist}</div>}

      {!live && (
        <div className="scrub">
          <input
            type="range"
            min={0}
            max={p.duration || 0}
            step={1}
            value={Math.min(p.position, p.duration || 0)}
            onChange={(e) => p.seek(Number(e.target.value))}
            style={{ ['--pct' as string]: `${pct}%` }}
            aria-label="Position"
          />
          <div className="scrub-times">
            <span>{formatClock(p.position)}</span>
            <span>{p.duration ? `-${formatClock(Math.max(0, p.duration - p.position))}` : ''}</span>
          </div>
        </div>
      )}

      <div className="controls">
        {!live && (
          <button onClick={p.prev} aria-label={s.player.prev} className="ctl">
            <Prev size={28} />
          </button>
        )}
        {!live && (
          <button onClick={() => p.skip(-15)} aria-label={s.player.back15} className="ctl">
            <Back15 size={30} />
          </button>
        )}
        <button className={`bigplay${on ? ' on' : ''}`} onClick={p.toggle} aria-label={on ? s.common.pause : s.common.play}>
          {busy ? <Spinner size={38} /> : on ? <Pause size={38} /> : <Play size={38} />}
        </button>
        {!live && (
          <button onClick={() => p.skip(30)} aria-label={s.player.fwd30} className="ctl">
            <Fwd30 size={30} />
          </button>
        )}
        {!live && (
          <button onClick={p.next} aria-label={s.player.next} className="ctl">
            <Next size={28} />
          </button>
        )}
      </div>
      {p.status === 'error' && <p className="center error">{s.player.error}</p>}

      {!live && (
        <div className="rates" aria-label={s.player.speed}>
          {RATES.map((r) => (
            <button key={r} className={`chip${p.rate === r ? ' on' : ''}`} onClick={() => p.setRate(r)}>
              {r}×
            </button>
          ))}
        </div>
      )}
    </main>
  );
}
