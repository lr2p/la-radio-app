import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchEpisodes, type Episode, type Podcast } from '../lib/api';
import { formatDate, formatDuration, prettyTitle, shortDescription } from '../lib/format';
import { useSettings } from '../lib/settings';
import { usePlayer } from '../player/PlayerContext';
import { lookFor } from '../shows';
import { Check, ChevronLeft, Pause, Play, Rss, Spinner } from '../components/Icons';
import { usePodcasts } from './Podcasts';

const PAGE = 30;

export default function Show() {
  const { id = '' } = useParams();
  const { lang, s } = useSettings();
  const p = usePlayer();
  const { list } = usePodcasts();
  const podcast: Podcast | undefined = list?.find((x) => x.id === id);
  const [episodes, setEpisodes] = useState<Episode[] | null>(null);
  const [error, setError] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setEpisodes(null);
    setError(false);
    fetchEpisodes(id)
      .then((l) => alive && setEpisodes(l))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [id]);

  const look = lookFor(podcast?.slug ?? '');
  const copyFeed = async () => {
    if (!podcast?.feed) return;
    try {
      await navigator.clipboard.writeText(podcast.feed);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.open(podcast.feed, '_blank');
    }
  };

  return (
    <main className="page" style={{ ['--accent' as string]: look.color }}>
      <Link to="/podcasts" className="back">
        <ChevronLeft size={20} /> {s.show.back}
      </Link>

      {podcast && (
        <header className="show-head">
          <img src={podcast.art} alt="" className="show-head-art" />
          <div>
            <h1>{podcast.title}</h1>
            {look.voice && (
              <div className="show-head-voice">
                {s.podcasts.by} {look.voice}
              </div>
            )}
            <p className="show-head-desc">{shortDescription(podcast.description, 320)}</p>
            <div className="chips">
              <button className="chip" onClick={copyFeed}>
                {copied ? <Check size={16} /> : <Rss size={16} />} {copied ? s.show.copied : s.show.rss}
              </button>
            </div>
          </div>
        </header>
      )}

      <h2 className="section-title">{s.show.latest}</h2>
      {!episodes && !error && (
        <div className="center">
          <Spinner size={28} />
        </div>
      )}
      {error && <p className="center">{s.podcasts.error}</p>}
      {episodes && episodes.length === 0 && <p className="center">{s.show.noEpisodes}</p>}

      {episodes && podcast && (
        <ul className="episodes">
          {episodes.slice(0, shown).map((e) => {
            const current = p.isCurrent(e.id);
            const playing = current && (p.status === 'playing' || p.status === 'loading');
            const saved = p.savedPosition(e.id);
            const done = saved < 0 || (() => {
              try {
                return localStorage.getItem(`lra.pos.${e.id}`) === '-1';
              } catch {
                return false;
              }
            })();
            const title = prettyTitle(e.title, lang);
            const desc = shortDescription(e.description);
            const isOpen = open === e.id;
            return (
              <li key={e.id} className={`episode${current ? ' current' : ''}`}>
                <button
                  className="ep-play"
                  onClick={() => (playing ? p.pause() : p.playEpisode(e, podcast, episodes))}
                  aria-label={playing ? s.common.pause : s.common.play}
                >
                  {current && p.status === 'loading' ? <Spinner size={22} /> : playing ? <Pause size={22} /> : <Play size={22} />}
                </button>
                <div className="ep-body" onClick={() => setOpen(isOpen ? null : e.id)}>
                  <div className="ep-title">{title}</div>
                  <div className="ep-meta">
                    {formatDate(e.publishedAt, lang)}
                    {e.duration ? ` · ${formatDuration(e.duration)}` : ''}
                    {done ? ` · ${s.show.played}` : saved > 0 ? ` · ${s.show.resume} ${formatDuration(saved)}` : ''}
                  </div>
                  {desc && <div className={`ep-desc${isOpen ? ' open' : ''}`}>{isOpen ? e.description.split(/\n\n+/).slice(0, -1).join('\n\n') || desc : desc}</div>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {episodes && episodes.length > shown && (
        <div className="center">
          <button className="btn" onClick={() => setShown((n) => n + PAGE)}>
            {s.show.loadMore}
          </button>
        </div>
      )}
    </main>
  );
}
