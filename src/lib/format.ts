import type { Lang } from '../config';

const TITLE_RE = /^(.+?)_(\d{4}-\d{2}-\d{2})(?:_(\d+))?(?:\s+[—–-]\s+(.*))?$/;

/** Un titre brut d'AzuraCast (« La_Question_2026-09-05 — Sujet ») → lisible. */
export function prettyTitle(raw: string, lang: Lang): string {
  const m = TITLE_RE.exec(raw.trim());
  if (!m) return raw.replace(/_/g, ' ').trim();
  const [, base, date, n, rest] = m;
  const name = base.replace(/_/g, ' ');
  const when = formatDate(date, lang);
  if (rest && rest.trim()) return `${rest.trim()} (${when}${n ? ` · ${n}` : ''})`;
  return `${name} — ${when}${n ? ` · ${n}` : ''}`;
}

export function formatDate(iso: string | number, lang: Lang): string {
  const d = typeof iso === 'number' ? new Date(iso * 1000) : new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function formatDuration(s: number | null | undefined): string {
  if (s == null || !Number.isFinite(s) || s <= 0) return '';
  const total = Math.round(s);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  if (h) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export function formatClock(s: number): string {
  if (!Number.isFinite(s) || s < 0) s = 0;
  return formatDuration(Math.max(1, s)) || '0:00';
}

/** Coupe la description à un paragraphe lisible, sans le pied de page de la charte. */
export function shortDescription(text: string, max = 220): string {
  const first = text.split(/\n\n+/)[0] ?? '';
  const clean = first.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max).replace(/\s+\S*$/, '')}…`;
}
