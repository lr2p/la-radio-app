import { useEffect, useState } from 'react';
import { JOURNAL_CHANNEL_URL, YOUTUBE_CHANNEL_URL } from '../config';
import { fetchVideos, type Video } from '../lib/api';

type Series = NonNullable<Video['series']>;
const SERIES: Series[] = ['marvin', 'matinale', 'debrief'];
import { formatDate } from '../lib/format';
import { useSettings } from '../lib/settings';
import { usePlayer } from '../player/PlayerContext';
import { External, Play, Spinner } from '../components/Icons';

export default function Videos() {
  const { lang, s } = useSettings();
  const p = usePlayer();
  const [videos, setVideos] = useState<Video[] | null>(null);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [series, setSeries] = useState<Series | null>(null);
  const shown = videos?.filter((v) => !series || (v.series ?? 'marvin') === series);

  useEffect(() => {
    fetchVideos()
      .then(setVideos)
      .catch(() => setError(true));
  }, []);

  const play = (id: string) => {
    // Une vidéo et l'antenne ne parlent pas en même temps.
    if (p.status === 'playing' || p.status === 'loading') p.pause();
    setOpen(id);
  };

  return (
    <main className="page">
      <header className="page-head">
        <h1>{s.videos.title}</h1>
        <p>{s.videos.subtitle}</p>
      </header>
      {!videos && !error && (
        <div className="center">
          <Spinner size={28} />
        </div>
      )}
      {error && <p className="center">{s.podcasts.error}</p>}
      {videos && videos.length > 0 && (
        <div className="chips video-series" role="tablist">
          <button className={`chip${series === null ? ' on' : ''}`} onClick={() => setSeries(null)}>
            {s.videos.all}
          </button>
          {SERIES.filter((k) => videos.some((v) => (v.series ?? 'marvin') === k)).map((k) => (
            <button key={k} className={`chip${series === k ? ' on' : ''}`} onClick={() => setSeries(k)}>
              {s.videos.series[k]}
            </button>
          ))}
        </div>
      )}
      {shown && shown.length === 0 && <p className="center">{s.videos.empty}</p>}

      <div className="videos">
        {shown?.map((v) => (
          <article key={v.id} className={`video${v.kind === 'short' ? ' short' : ''}`}>
            {open === v.id ? (
              <div className="video-frame">
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${v.id}?autoplay=1&playsinline=1&rel=0`}
                  title={v.title}
                  allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            ) : (
              <button className="video-thumb" onClick={() => play(v.id)} aria-label={v.title}>
                <img src={`https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`} alt="" loading="lazy" />
                <span className="video-play">
                  <Play size={30} />
                </span>
              </button>
            )}
            <div className="video-text">
              <div className="video-title">{v.title}</div>
              <div className="video-meta">
                {formatDate(v.publishedAt, lang)} ·{' '}
                {v.series && v.series !== 'marvin' ? s.videos.series[v.series] : v.kind === 'short' ? s.videos.short : s.videos.film}
              </div>
            </div>
          </article>
        ))}
      </div>

      <div className="center">
        <a className="btn ghost" href={series === 'matinale' || series === 'debrief' ? JOURNAL_CHANNEL_URL : YOUTUBE_CHANNEL_URL} target="_blank" rel="noreferrer">
          <External size={16} /> {s.videos.channel}
        </a>
      </div>
    </main>
  );
}
