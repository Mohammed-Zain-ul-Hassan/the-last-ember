// Asset manifest: every external file loads through public/assets/manifest.json.
// A missing or broken entry logs a warning and the game keeps its procedural fallback; it never crashes.

export interface Manifest {
  version: number;
  models?: Record<string, string>;
  audio?: Record<string, string>;
  images?: Record<string, string>;
}

export async function loadManifest(): Promise<Manifest> {
  try {
    const res = await fetch('./assets/manifest.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as Manifest;
  } catch (err) {
    console.warn('[assets] manifest missing or broken, using built-in fallbacks:', err);
    return { version: 0 };
  }
}
