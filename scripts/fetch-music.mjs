/**
 * Download pinned CC0 Freesound beds into public/music/.
 * Requires FREESOUND_API_KEY in .env (token auth; previews need no OAuth).
 * Re-downloads when the pinned sound id changes (tracked in manifest.json).
 * Set FORCE=1 to always overwrite.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'music');
const manifestPath = join(outDir, 'manifest.json');
const api = 'https://freesound.org/apiv2';
const FORCE = process.env.FORCE === '1' || process.env.FORCE === 'true';

/** Stable sound IDs — re-run after changing these. */
const SOUNDS = [
  {
    file: 'ambient.mp3',
    id: 789404,
    note: 'dark moody orchestral ambient exploration bed (Obsidian)',
  },
  {
    file: 'combat.mp3',
    id: 676998,
    note: 'tense synth fight loop — combat bed',
  },
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

async function loadManifest() {
  try {
    return JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch {
    return {};
  }
}

async function main() {
  const token = await loadKey();
  await mkdir(outDir, { recursive: true });
  const prev = await loadManifest();
  const next = {};

  const attribution = [
    '# Music Attribution',
    '',
    'Creative Commons 0 (public domain dedication) from [Freesound](https://freesound.org).',
    'Fetched as an HQ preview MP3 via the Freesound API.',
    '',
  ];

  for (const sound of SOUNDS) {
    const dest = join(outDir, sound.file);
    const meta = await fetchJson(
      `${api}/sounds/${sound.id}/?fields=id,name,username,license,duration,url,previews`,
      token,
    );
    const stale = prev[sound.file] !== sound.id;
    if (FORCE || stale) {
      const preview = meta.previews?.['preview-hq-mp3'] ?? meta.previews?.['preview-lq-mp3'];
      if (!preview) throw new Error(`No preview URL for sound ${sound.id}`);
      const bytes = await download(preview, dest);
      console.log(
        `OK  ${sound.file}  ← #${sound.id} "${meta.name}" (${(bytes / 1024).toFixed(1)} KiB)${FORCE ? ' [FORCE]' : stale ? ' [id changed]' : ''}`,
      );
    } else {
      console.log(`skip ${sound.file}  (unchanged #${sound.id})`);
    }
    next[sound.file] = sound.id;

    attribution.push(`## ${sound.file}`);
    attribution.push(`- **Freesound #${meta.id}:** ${meta.name}`);
    attribution.push(`- **Author:** ${meta.username}`);
    attribution.push(`- **License:** ${meta.license}`);
    attribution.push(`- **Duration:** ${meta.duration?.toFixed?.(2) ?? meta.duration}s`);
    attribution.push(`- **URL:** ${meta.url}`);
    attribution.push(`- **Use:** ${sound.note}`);
    attribution.push('');
  }

  await writeFile(manifestPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  await writeFile(join(outDir, 'ATTRIBUTION.md'), attribution.join('\n'), 'utf8');
  console.log(`Wrote manifest.json + ATTRIBUTION.md → ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
