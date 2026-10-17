/**
 * Download pinned CC0 Freesound preview MP3s into public/sfx/.
 * Requires FREESOUND_API_KEY in .env (token auth; previews need no OAuth).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'sfx');
const api = 'https://freesound.org/apiv2';

/** Stable sound IDs — re-run after changing these. */
const SOUNDS = [
  { file: 'footstep-walk.mp3', id: 563468, note: 'soft hard-surface walk' },
  { file: 'footstep-run.mp3', id: 563458, note: 'hard-surface run step' },
  { file: 'recall-start.mp3', id: 802453, note: 'reverse whoosh / chrono pull' },
  { file: 'recall-land.mp3', id: 789596, note: 'short chime lock-in' },
  { file: 'fireball-throw.mp3', id: 683179, note: 'fireball cast whoosh' },
  { file: 'fireball-impact.mp3', id: 570855, note: 'magic projectile impact' },
  { file: 'enemy-hit.mp3', id: 276600, note: 'body hit / padded thock' },
  { file: 'jump.mp3', id: 475133, note: 'heavy swoosh — armored body leaving the ground' },
  { file: 'fireball-charge.mp3', id: 555060, note: 'rising charge-up while gathering a fireball' },
];

async function loadKey() {
  const fromEnv = process.env.FREESOUND_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  const envPath = join(root, '.env');
  const text = await readFile(envPath, 'utf8');
  const match = text.match(/^FREESOUND_API_KEY=(.+)$/m);
  if (!match) throw new Error('FREESOUND_API_KEY missing from .env');
  return match[1].trim();
}

async function fetchJson(url, token) {
  const res = await fetch(url, { headers: { Authorization: `Token ${token}` } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} downloading ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
  return buf.length;
}

async function main() {
  const token = await loadKey();
  await mkdir(outDir, { recursive: true });

  const attribution = [
    '# SFX Attribution',
    '',
    'All samples below are Creative Commons 0 (public domain dedication) from [Freesound](https://freesound.org).',
    'Fetched as HQ preview MP3s via the Freesound API.',
    '',
  ];

  for (const entry of SOUNDS) {
    const meta = await fetchJson(
      `${api}/sounds/${entry.id}/?fields=id,name,username,license,duration,url,previews`,
      token,
    );
    const preview = meta.previews?.['preview-hq-mp3'] ?? meta.previews?.['preview-lq-mp3'];
    if (!preview) throw new Error(`No preview URL for sound ${entry.id}`);

    const dest = join(outDir, entry.file);
    const bytes = await download(preview, dest);
    console.log(`OK  ${entry.file}  ← #${entry.id} "${meta.name}" (${(bytes / 1024).toFixed(1)} KiB)`);

    attribution.push(`## ${entry.file}`);
    attribution.push(`- **Freesound #${meta.id}:** ${meta.name}`);
    attribution.push(`- **Author:** ${meta.username}`);
    attribution.push(`- **License:** ${meta.license}`);
    attribution.push(`- **Duration:** ${meta.duration?.toFixed?.(2) ?? meta.duration}s`);
    attribution.push(`- **URL:** ${meta.url}`);
    attribution.push(`- **Use:** ${entry.note}`);
    attribution.push('');
  }

  await writeFile(join(outDir, 'ATTRIBUTION.md'), attribution.join('\n'), 'utf8');
  console.log(`Wrote ${SOUNDS.length} files + ATTRIBUTION.md → ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
