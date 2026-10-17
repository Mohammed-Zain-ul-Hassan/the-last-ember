/**
 * Generate character voice lines with ElevenLabs into public/vo/.
 * Requires ELEVENLABS_API_KEY in .env. Designs two original voices (Voice Design API) on the
 * first run and caches their IDs in scripts/vo-voices.json; falls back to library voices if
 * voice design is unavailable on the account.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'vo');
const cachePath = join(root, 'scripts', 'vo-voices.json');
const api = 'https://api.elevenlabs.io/v1';
const TTS_MODEL = 'eleven_multilingual_v2';
const FORMAT = 'mp3_44100_128';

const VOICES = {
  runner: {
    name: 'Last Ember - Runner Knight',
    description:
      'A mid-low, steady male knight in plate armor. Noble, clipped, resolute delivery, slight metallic resonance, measured and calm.',
    preview:
      'Steel returns, and the vessel stands. I have walked this road a hundred times before, and I will walk it a hundred more. Hold the line. The ember does not go out while I still breathe.',
    settings: { stability: 0.72, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true, speed: 0.95 },
    fallbackPrefer: ['Daniel', 'George', 'Brian'],
    fallbackHints: ['deep', 'calm', 'steady', 'authoritative', 'british', 'narrat'],
  },
  shadow: {
    name: 'Last Ember - Shadow Wraith',
    description:
      'A very deep, gravelly, rasping male whisper-growl, menacing and cold, like a shadowy reaper assassin. Slow, breathy, intimidating, close-mic.',
    preview:
      'Let the dark take hold. I am the shadow at your back, the cold breath on your neck. There is nowhere left to run, and no one left to hear you. Death walks among you now.',
    settings: { stability: 0.28, similarity_boost: 0.85, style: 0.55, use_speaker_boost: true, speed: 0.88 },
    fallbackPrefer: ['Callum', 'Harry', 'Adam'],
    fallbackHints: ['gravel', 'raspy', 'husky', 'deep', 'dark', 'gruff', 'intense'],
  },
};

/** Short, original barks: three variants per form/event. */
const LINES = {
  runner: {
    swap: ['Steel returns.', 'Back in the armor.', 'The vessel stands.'],
    recall: ['Again.', 'Not yet.', 'Turn back the hour.'],
  },
  shadow: {
    swap: ['Let the dark take hold.', 'I am the shadow.', 'Death walks.'],
    recall: ['Back from the grave.', 'Time bends to me.', 'Not today.'],
    throw: ['Die.', 'Fall.', 'Into darkness.'],
    dual: ['Death comes!', 'Die... die... die.', 'Nowhere to run.'],
  },
};

async function loadKey() {
  const fromEnv = process.env.ELEVENLABS_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  const text = await readFile(join(root, '.env'), 'utf8');
  const match = text.match(/^ELEVENLABS_API_KEY=(.+)$/m);
  if (!match) throw new Error('ELEVENLABS_API_KEY missing from .env');
  return match[1].trim();
}

async function request(key, path, { method = 'GET', body, binary = false } = {}) {
  const res = await fetch(`${api}${path}`, {
    method,
    headers: { 'xi-api-key': key, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 400);
    throw new Error(`${res.status} ${res.statusText} for ${method} ${path}: ${detail}`);
  }
  return binary ? Buffer.from(await res.arrayBuffer()) : res.json();
}

async function loadCache() {
  try {
    return JSON.parse(await readFile(cachePath, 'utf8'));
  } catch {
    return {};
  }
}

/** Voice Design: prompt → previews → saved voice. Tries the current API, then the legacy one. */
async function designVoice(key, spec) {
  let generated;
  try {
    const res = await request(key, '/text-to-voice/design', {
      method: 'POST',
      body: { voice_description: spec.description, text: spec.preview, model_id: 'eleven_multilingual_ttv_v2' },
    });
    generated = res.previews?.[0]?.generated_voice_id;
    if (!generated) throw new Error('design returned no previews');
    const voice = await request(key, '/text-to-voice', {
      method: 'POST',
      body: { voice_name: spec.name, voice_description: spec.description, generated_voice_id: generated },
    });
    return voice.voice_id;
  } catch (err) {
    console.warn(`    current design API failed (${err.message}); trying legacy endpoints`);
  }
  const res = await request(key, '/text-to-voice/create-previews', {
    method: 'POST',
    body: { voice_description: spec.description, text: spec.preview },
  });
  generated = res.previews?.[0]?.generated_voice_id;
  if (!generated) throw new Error('legacy create-previews returned no previews');
  const voice = await request(key, '/text-to-voice/create-voice-from-preview', {
    method: 'POST',
    body: { voice_name: spec.name, voice_description: spec.description, generated_voice_id: generated },
  });
  return voice.voice_id;
}

/** Best deep male library voice by label/description keywords, avoiding `exclude`. */
async function pickLibraryVoice(key, spec, exclude) {
  const { voices = [] } = await request(key, '/voices');
  const usable = voices.filter((v) => v.voice_id !== exclude);
  for (const name of spec.fallbackPrefer) {
    const v = usable.find((x) => x.name.split(/\s|-/)[0] === name);
    if (v) return { id: v.voice_id, name: v.name };
  }
  const scored = usable
    .map((v) => {
      const labels = v.labels ?? {};
      const hay = `${v.name} ${v.description ?? ''} ${Object.values(labels).join(' ')}`.toLowerCase();
      let score = labels.gender === 'male' ? 5 : labels.gender ? -10 : 0;
      if (/middle|old/.test(labels.age ?? '')) score += 1;
      spec.fallbackHints.forEach((h, i) => {
        if (hay.includes(h)) score += spec.fallbackHints.length - i;
      });
      return { v, score };
    })
    .sort((a, b) => b.score - a.score);
  if (!scored.length) throw new Error('no library voices available');
  return { id: scored[0].v.voice_id, name: scored[0].v.name };
}

async function main() {
  const key = await loadKey();
  await mkdir(outDir, { recursive: true });
  const cache = await loadCache();

  for (const [form, spec] of Object.entries(VOICES)) {
    if (cache[form]?.voice_id) {
      console.log(`voice ${form}: cached ${cache[form].voice_id} (${cache[form].source})`);
      continue;
    }
    try {
      console.log(`voice ${form}: designing…`);
      const id = await designVoice(key, spec);
      cache[form] = { voice_id: id, source: 'designed', name: spec.name };
    } catch (err) {
      console.warn(`voice ${form}: design unavailable (${err.message}); using a library voice`);
      const other = Object.entries(cache).find(([f]) => f !== form)?.[1]?.voice_id;
      const pick = await pickLibraryVoice(key, spec, other);
      cache[form] = { voice_id: pick.id, source: 'library', name: pick.name };
    }
    await writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`, 'utf8');
    console.log(`voice ${form}: ${cache[form].voice_id} (${cache[form].source}: ${cache[form].name})`);
  }

  const manifest = {};
  let count = 0;
  for (const [form, events] of Object.entries(LINES)) {
    manifest[form] = {};
    const { voice_id } = cache[form];
    for (const [event, lines] of Object.entries(events)) {
      manifest[form][event] = [];
      for (let n = 0; n < lines.length; n++) {
        const file = `${form}_${event}_${n + 1}.mp3`;
        const audio = await request(key, `/text-to-speech/${voice_id}?output_format=${FORMAT}`, {
          method: 'POST',
          body: { text: lines[n], model_id: TTS_MODEL, voice_settings: VOICES[form].settings },
          binary: true,
        });
        await writeFile(join(outDir, file), audio);
        manifest[form][event].push(`/vo/${file}`);
        count++;
        console.log(`OK  ${file}  "${lines[n]}" (${(audio.length / 1024).toFixed(1)} KiB)`);
      }
    }
  }

  await writeFile(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  const credits = [
    'Character voice lines generated with ElevenLabs (https://elevenlabs.io) text-to-speech.',
    `Model: ${TTS_MODEL}, format ${FORMAT}. Regenerate with: npm run vo:fetch`,
    '',
    ...Object.entries(cache).map(([form, v]) =>
      v.source === 'designed'
        ? `${form}: original voice created with ElevenLabs Voice Design ("${v.name}"), from a text prompt only — no cloned audio.`
        : `${form}: ElevenLabs library voice "${v.name}".`,
    ),
    '',
  ];
  await writeFile(join(outDir, 'CREDITS.txt'), credits.join('\n'), 'utf8');
  console.log(`Wrote ${count} clips + manifest.json + CREDITS.txt → ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
