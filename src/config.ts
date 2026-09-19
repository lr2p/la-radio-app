// Les deux antennes et les points d'entrée publics d'AzuraCast.
// Tout ce qui est ici est PUBLIC (aucun jeton) : c'est la condition pour qu'une app
// installée chez l'auditeur puisse parler à la radio directement.

export const AZ = 'https://stream.la-radio.ai';
export const SITE = 'https://la-radio.ai';

export type StationId = 'fr' | 'en';
export type Lang = 'fr' | 'en';

export interface Station {
  id: StationId;
  lang: Lang;
  name: string;
  label: string;
  stream: string;
  /** L'API « now playing » d'AzuraCast — répond 404 sur l'antenne anglaise (page publique fermée). */
  nowplaying: string;
  /** Le statut Icecast de l'antenne : public, avec CORS, toujours vrai. Repli de l'anglais. */
  icecast: string | null;
  /** Faux tant que la page publique AzuraCast de l'antenne est fermée (404 sans CORS). */
  nowplayingPublic: boolean;
  timezone: string;
}

export const STATIONS: Record<StationId, Station> = {
  fr: {
    id: 'fr',
    lang: 'fr',
    name: 'La Radio AI',
    label: 'Français',
    stream: `${AZ}/listen/la_radio_ai_/radio.mp3`,
    nowplaying: `${AZ}/api/nowplaying/1`,
    icecast: null,
    nowplayingPublic: true,
    timezone: 'Europe/Paris',
  },
  en: {
    id: 'en',
    lang: 'en',
    name: 'La Radio AI English',
    label: 'English',
    stream: `${AZ}/listen/airia/radio.mp3`,
    nowplaying: `${AZ}/api/nowplaying/2`,
    icecast: `${AZ}:8010/status-json.xsl`,
    nowplayingPublic: false,
    timezone: 'America/New_York',
  },
};

/** Les podcasts vivent tous sur la station 1, quelle que soit leur langue. */
export const PODCASTS_API = `${AZ}/api/station/1/public`;

export const YOUTUBE_CHANNEL_ID = 'UCixrn6xPgobbRB_ECoFR6tQ';
export const YOUTUBE_CHANNEL_URL = 'https://www.youtube.com/@lr2paris';

export const NOWPLAYING_INTERVAL_MS = 15_000;
