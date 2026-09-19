import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchPodcasts, type Podcast } from '../lib/api';
import { useSettings } from '../lib/settings';
import { lookFor } from '../shows';
import { Spinner } from '../components/Icons';

let cache: Podcast[] | null = null;

export function usePodcasts() {
  const [list, setList] = useState<Podcast[] | null>(cache);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setError(null);
    fetchPodcasts()
      .then((l) => {
        cache = l;
        if (alive) setList(l);
      })
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, [tick]);
  return { list, error, retry: () => setTick((n) => n + 1) };
}

export default function Podcasts() {
  const { lang, s } = useSettings();
  const { list, error, retry } = usePodcasts();

  const sorted = (l: Podcast[]) => [...l].sort((a, b) => lookFor(a.slug).order - lookFor(b.slug).order || a.title.localeCompare(b.title));
  const mine = list ? sorted(list.filter((p) => p.lang === lang)) : [];
  const others = list ? sorted(list.filter((p) => p.lang !== lang)) : [];

  return (
    <main className="page">
      <header className="page-head">
        <h1>{s.podcasts.title}</h1>
        <p>{s.podcasts.subtitle}</p>
      </header>

      {!list && !error && (
        <div className="center">
          <Spinner size={28} />
        </div>
      )}
      {error && (
        <div className="center">
          <p>{s.podcasts.error}</p>
          <button className="btn" onClick={retry}>
            {s.podcasts.retry}
          </button>
        </div>
      )}
      {list && list.length === 0 && <p className="center">{s.podcasts.empty}</p>}

      {mine.length > 0 && <ShowGrid items={mine} />}
      {others.length > 0 && (
        <>
          <h2 className="section-title">{lang === 'fr' ? s.podcasts.inEnglish : s.podcasts.inFrench}</h2>
          <ShowGrid items={others} />
        </>
      )}
    </main>
  );
}

function ShowGrid({ items }: { items: Podcast[] }) {
  const { s } = useSettings();
  return (
    <div className="grid">
      {items.map((p) => {
        const look = lookFor(p.slug);
        return (
          <Link key={p.id} to={`/podcasts/${p.id}`} className="show-card" style={{ ['--accent' as string]: look.color }}>
            <img src={p.art} alt="" className="show-art" loading="lazy" />
            <div className="show-text">
              <div className="show-title">{p.title}</div>
              <div className="show-sub">
                {look.voice ? `${s.podcasts.by} ${look.voice} · ` : ''}
                {s.podcasts.episodes(p.episodes)}
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
