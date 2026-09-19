import { HashRouter, Route, Routes, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { MiniPlayer, TabBar } from './components/Chrome';
import { SettingsProvider, useSettings } from './lib/settings';
import { PlayerProvider } from './player/PlayerContext';
import About from './pages/About';
import Live from './pages/Live';
import Player from './pages/Player';
import Podcasts from './pages/Podcasts';
import Show from './pages/Show';
import Videos from './pages/Videos';

function Shell() {
  const loc = useLocation();
  const { lang } = useSettings();
  const inPlayer = loc.pathname === '/player';
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [loc.pathname]);
  return (
    <div className={`shell${inPlayer ? ' in-player' : ''}`}>
      <Routes>
        <Route path="/" element={<Live />} />
        <Route path="/podcasts" element={<Podcasts />} />
        <Route path="/podcasts/:id" element={<Show />} />
        <Route path="/videos" element={<Videos />} />
        <Route path="/about" element={<About />} />
        <Route path="/player" element={<Player />} />
        <Route path="*" element={<Live />} />
      </Routes>
      {!inPlayer && <MiniPlayer />}
      {!inPlayer && <TabBar />}
    </div>
  );
}

export default function App() {
  return (
    <SettingsProvider>
      <PlayerProvider>
        <HashRouter>
          <Shell />
        </HashRouter>
      </PlayerProvider>
    </SettingsProvider>
  );
}
