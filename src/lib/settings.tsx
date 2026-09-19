import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Lang, StationId } from '../config';
import { t, type Strings } from '../i18n';

interface Settings {
  station: StationId;
  lang: Lang;
  s: Strings;
  setStation: (id: StationId) => void;
}

const Ctx = createContext<Settings | null>(null);
const KEY = 'lra.station';

function initialStation(): StationId {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'fr' || v === 'en') return v;
  } catch {
    /* ignoré */
  }
  return navigator.language?.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [station, setStationState] = useState<StationId>(initialStation);
  const setStation = useCallback((id: StationId) => {
    setStationState(id);
    try {
      localStorage.setItem(KEY, id);
    } catch {
      /* ignoré */
    }
    document.documentElement.lang = id;
  }, []);
  const value = useMemo<Settings>(() => ({ station, lang: station, s: t(station), setStation }), [station, setStation]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSettings(): Settings {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSettings hors SettingsProvider');
  return v;
}
