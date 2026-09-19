// Fabrique les icônes de l'app et les pochettes des podcasts depuis brand/logo.png.
//   node scripts/assets.mjs
// Sorties : public/icons/*.png, public/brand/logo.png, public/covers/<slug>.png (1400×1400,
// le format attendu par Apple Podcasts). Les pochettes sont ensuite copiées sur le VPS
// (/opt/la-radio/podcast-art/) où podcasts-sync.py les pose sur chaque podcast.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const logo = path.join(root, 'brand', 'logo.png');

// Le catalogue d'habillage : même liste que src/shows.ts et que SHOWS dans podcasts-sync.py.
const SHOWS = [
  ['matinale', 'La Matinale', 'Charlotte', '#0ea5e9', 'fr'],
  ['debrief', 'Le Débrief', 'Charlotte', '#f97316', 'fr'],
  ['cejourla', 'Ce jour Là', 'Marvin', '#a855f7', 'fr'],
  ['cejourla-integrale', "Ce jour Là\nl'intégrale", 'Marvin', '#7c3aed', 'fr'],
  ['richard-fr', 'La Question\nde Richard', 'Richard', '#6366f1', 'fr'],
  ['simon', 'Les Good News\nde Simon', 'Simon', '#10b981', 'fr'],
  ['gueulante', 'La Gueulante', 'Hellno', '#ef4444', 'fr'],
  ['daniel-fr', "L'actu IA\navec Daniel", 'Daniel', '#3b82f6', 'fr'],
  ['analyse-express-fr', "L'Analyse\nExpress", 'William', '#f59e0b', 'fr'],
  ['deep-dive-fr', 'Le Deep Dive', 'Charlotte', '#14b8a6', 'fr'],
  ['richard-en', 'Richard\nQuestions', 'Richard', '#6366f1', 'en'],
  ['kelvin', 'Kelvin\nGood News', 'Kelvin', '#10b981', 'en'],
  ['hellno', 'Hell No', 'Hellno', '#ef4444', 'en'],
  ['daniel-en', 'Daniel News', 'Daniel', '#3b82f6', 'en'],
  ['quick-analysis', 'Quick\nAnalysis', 'William', '#f59e0b', 'en'],
  ['deep-dive-en', 'Deep Dive', 'Charlotte', '#14b8a6', 'en'],
];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/'/g, '&#39;');

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(v * f))));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function coverSvg(title, voice, color, lang, logoB64) {
  const lines = title.split('\n');
  const size = lines.some((l) => l.length > 12) ? 132 : 150;
  const y0 = 760 - ((lines.length - 1) * size) / 2;
  const text = lines
    .map((l, i) => `<text x="110" y="${y0 + i * size * 1.05}" font-size="${size}" font-weight="900" fill="#fff">${esc(l)}</text>`)
    .join('');
  const bars = Array.from({ length: 28 }, (_, i) => {
    const h = 40 + Math.abs(Math.sin(i * 1.7) * 160 + Math.cos(i * 0.6) * 60);
    return `<rect x="${110 + i * 44}" y="${1180 - h / 2}" width="20" height="${h}" rx="10" fill="rgba(255,255,255,0.28)"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="1400" viewBox="0 0 1400 1400">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${shade(color, 1.15)}"/>
      <stop offset="0.55" stop-color="${color}"/>
      <stop offset="1" stop-color="${shade(color, 0.45)}"/>
    </linearGradient>
    <radialGradient id="r" cx="0.85" cy="0.15" r="0.7">
      <stop offset="0" stop-color="rgba(255,255,255,0.35)"/>
      <stop offset="1" stop-color="rgba(255,255,255,0)"/>
    </radialGradient>
  </defs>
  <rect width="1400" height="1400" fill="url(#g)"/>
  <rect width="1400" height="1400" fill="url(#r)"/>
  <image href="data:image/png;base64,${logoB64}" x="1030" y="90" width="280" height="280" opacity="0.95"/>
  <g font-family="Inter, Helvetica, Arial, sans-serif">
    <text x="110" y="180" font-size="54" font-weight="700" fill="rgba(255,255,255,0.85)" letter-spacing="6">LA RADIO AI</text>
    ${text}
    ${voice ? `<text x="110" y="${y0 + lines.length * size * 1.05 + 20}" font-size="58" font-weight="600" fill="rgba(255,255,255,0.85)">${esc(lang === 'fr' ? 'avec ' : 'with ')}${esc(voice)}</text>` : ''}
    ${bars}
  </g>
</svg>`;
}

async function main() {
  const base = await readFile(logo);
  const logoB64 = base.toString('base64');
  await mkdir(path.join(root, 'public', 'icons'), { recursive: true });
  await mkdir(path.join(root, 'public', 'brand'), { recursive: true });
  await mkdir(path.join(root, 'public', 'covers'), { recursive: true });

  // Le logo lui-même (fond violet inclus) sert d'icône ; la variante maskable
  // reçoit une marge de sécurité de 12 %.
  for (const s of [192, 512]) {
    await sharp(base).resize(s, s).png().toFile(path.join(root, 'public', 'icons', `icon-${s}.png`));
  }
  await sharp(base).resize(180, 180).png().toFile(path.join(root, 'public', 'icons', 'apple-touch-icon.png'));
  const inner = await sharp(base).resize(400, 400).png().toBuffer();
  await sharp({ create: { width: 512, height: 512, channels: 4, background: '#2c2569' } })
    .composite([{ input: inner, left: 56, top: 56 }])
    .png()
    .toFile(path.join(root, 'public', 'icons', 'icon-maskable-512.png'));
  await sharp(base).resize(512, 512).png().toFile(path.join(root, 'public', 'brand', 'logo.png'));

  for (const [slug, title, voice, color, lang] of SHOWS) {
    const svg = Buffer.from(coverSvg(title, voice, color, lang, logoB64));
    await sharp(svg).png({ quality: 90 }).toFile(path.join(root, 'public', 'covers', `${slug}.png`));
    console.log('cover', slug);
  }
  await writeFile(path.join(root, 'public', 'covers', 'index.json'), JSON.stringify(SHOWS.map(([slug]) => slug)));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
