import { SITE, YOUTUBE_CHANNEL_URL } from '../config';
import { useSettings } from '../lib/settings';
import { External } from '../components/Icons';

declare const __APP_VERSION__: string;

export default function About() {
  const { s } = useSettings();
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
  return (
    <main className="page about">
      <header className="page-head">
        <img src={`${import.meta.env.BASE_URL}brand/logo.png`} alt="La Radio AI" className="about-logo" />
        <h1>La Radio AI</h1>
      </header>
      <p className="about-text">{s.about.charter}</p>
      {!standalone && (
        <section className="card">
          <div className="card-label">{s.about.install}</div>
          <p className="about-text small">{s.about.installHint}</p>
        </section>
      )}
      <div className="links">
        <a className="btn ghost" href={SITE} target="_blank" rel="noreferrer">
          <External size={16} /> {s.about.site}
        </a>
        <a className="btn ghost" href={YOUTUBE_CHANNEL_URL} target="_blank" rel="noreferrer">
          <External size={16} /> YouTube
        </a>
      </div>
      <p className="version">
        {s.about.version} {__APP_VERSION__}
      </p>
    </main>
  );
}
