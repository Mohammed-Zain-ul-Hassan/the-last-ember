/**
 * Download a pinned CC0 Freesound dark-ambient preview into public/music/.
 * Requires FREESOUND_API_KEY in .env (token auth; previews need no OAuth).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'music');
const api = 'https://freesound.org/apiv2';

/** Stable sound ID — re-run after changing this. */
const SOUND = {
  file: 'ambient.mp3',
  id: 558274,
  note: 'dark mystic ambient bed (looped with crossfade at runtime)',
};

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

  const meta = await fetchJson(
    `${api}/sounds/${SOUND.id}/?fields=id,name,username,license,duration,url,previews`,
    token,
  );
  const preview = meta.previews?.['preview-hq-mp3'] ?? meta.previews?.['preview-lq-mp3'];
  if (!preview) throw new Error(`No preview URL for sound ${SOUND.id}`);

  const dest = join(outDir, SOUND.file);
  const bytes = await download(preview, dest);
  console.log(`OK  ${SOUND.file}  ← #${SOUND.id} "${meta.name}" (${(bytes / 1024).toFixed(1)} KiB)`);

  const attribution = [
    '# Music Attribution',
    '',
    'Creative Commons 0 (public domain dedication) from [Freesound](https://freesound.org).',
    'Fetched as an HQ preview MP3 via the Freesound API.',
    '',
    `## ${SOUND.file}`,
    `- **Freesound #${meta.id}:** ${meta.name}`,
    `- **Author:** ${meta.username}`,
    `- **License:** ${meta.license}`,
    `- **Duration:** ${meta.duration?.toFixed?.(2) ?? meta.duration}s`,
    `- **URL:** ${meta.url}`,
    `- **Use:** ${SOUND.note}`,
    '',
  ];

  await writeFile(join(outDir, 'ATTRIBUTION.md'), attribution.join('\n'), 'utf8');
  console.log(`Wrote ${SOUND.file} + ATTRIBUTION.md → ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
