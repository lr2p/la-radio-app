// L'habillage des émissions, par slug. Le slug vient du champ `link` du podcast
// AzuraCast (https://la-radio.ai/emissions/<slug>), posé par podcasts-sync.py.
// Une émission absente d'ici s'affiche quand même, avec l'habillage par défaut :
// le catalogue, lui, vit côté antenne.

export interface ShowLook {
  color: string;
  voice: string;
  /** Ordre d'affichage dans sa langue (plus petit = plus haut). */
  order: number;
}

export const SHOW_LOOKS: Record<string, ShowLook> = {
  matinale: { color: '#0ea5e9', voice: 'Charlotte', order: 10 },
  debrief: { color: '#f97316', voice: 'Charlotte', order: 11 },
  cejourla: { color: '#a855f7', voice: 'Marvin', order: 20 },
  'cejourla-integrale': { color: '#7c3aed', voice: 'Marvin', order: 21 },
  'deep-dive-fr': { color: '#14b8a6', voice: 'Charlotte', order: 30 },
  'richard-fr': { color: '#6366f1', voice: 'Richard', order: 40 },
  simon: { color: '#10b981', voice: 'Simon', order: 41 },
  gueulante: { color: '#ef4444', voice: 'Hellno', order: 42 },
  'daniel-fr': { color: '#3b82f6', voice: 'Daniel', order: 43 },
  'analyse-express-fr': { color: '#f59e0b', voice: 'William', order: 44 },
  'deep-dive-en': { color: '#14b8a6', voice: 'Charlotte', order: 30 },
  'richard-en': { color: '#6366f1', voice: 'Richard', order: 40 },
  kelvin: { color: '#10b981', voice: 'Kelvin', order: 41 },
  hellno: { color: '#ef4444', voice: 'Hellno', order: 42 },
  'daniel-en': { color: '#3b82f6', voice: 'Daniel', order: 43 },
  'quick-analysis': { color: '#f59e0b', voice: 'William', order: 44 },
};

const DEFAULT_LOOK: ShowLook = { color: '#8b5cf6', voice: '', order: 99 };

export function lookFor(slug: string): ShowLook {
  return SHOW_LOOKS[slug] ?? DEFAULT_LOOK;
}

export function slugFromLink(link: string | null | undefined, title: string): string {
  const m = /\/emissions\/([a-z0-9-]+)/i.exec(link ?? '');
  if (m) return m[1].toLowerCase();
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
