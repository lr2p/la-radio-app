import { NavLink, useNavigate } from 'react-router-dom';
import { useSettings } from '../lib/settings';
import { usePlayer } from '../player/PlayerContext';
import { STATIONS } from '../config';
import { formatClock } from '../lib/format';
import { Film, Info, Mic, Pause, Play, Radio, Spinner } from './Icons';

export function TabBar() {
  const { s } = useSettings();
  const tabs = [
    { to: '/', label: s.tabs.live, Icon: Radio, end: true },
    { to: '/podcasts', label: s.tabs.podcasts, Icon: Mic, end: false },
    { to: '/videos', label: s.tabs.videos, Icon: Film, end: false },
    { to: '/about', label: s.tabs.about, Icon: Info, end: false },
  ];
  return (
    <nav className="tabbar" aria-label="Navigation">
      {tabs.map(({ to, label, Icon, end }) => (
        <NavLink key={to} to={to} end={end} className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>
          <Icon size={22} />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export function MiniPlayer() {
  const p = usePlayer();
  const { s } = useSettings();
  const nav = useNavigate();
  const tr = p.track;
  if (!tr) return null;

  const live = tr.kind === 'live';
  const title = tr.kind === 'live' ? p.liveSong?.title || STATIONS[tr.station].name : tr.episode.title;
  const sub =
    tr.kind === 'live'
      ? `${s.player.live} · ${STATIONS[tr.station].name}${p.liveSong?.artist ? ` · ${p.liveSong.artist}` : ''}`
      : tr.podcast.title;
  const art = tr.kind === 'live' ? p.liveSong?.art ?? `${import.meta.env.BASE_URL}icons/icon-192.png` : tr.episode.art ?? tr.podcast.art;
  const pct = !live && p.duration > 0 ? Math.min(100, (p.position / p.duration) * 100) : 0;

  return (
    <div className="mini" role="region" aria-label="Lecteur">
      {!live && <div className="mini-progress" style={{ width: `${pct}%` }} />}
      <button className="mini-main" onClick={() => nav('/player')} aria-label={title}>
        <img src={art} alt="" className="mini-art" />
        <div className="mini-text">
          <div className="mini-title">{title}</div>
          <div className="mini-sub">
            {sub}
            {!live && p.duration > 0 ? ` · ${formatClock(p.position)} / ${formatClock(p.duration)}` : ''}
          </div>
        </div>
      </button>
      <button className="mini-btn" onClick={p.toggle} aria-label={p.status === 'playing' ? s.common.pause : s.common.play}>
        {p.status === 'loading' ? <Spinner size={26} /> : p.status === 'playing' ? <Pause size={26} /> : <Play size={26} />}
      </button>
    </div>
  );
}
