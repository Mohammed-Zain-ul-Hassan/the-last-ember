// ?trailer=1 capture tooling (needs ?debug=1; never loaded in normal play). Exposes window.__trailer:
//   take(name, seconds)  deterministic take: the game is stepped exactly 1/60 s per frame through __game.tick and
//                        every frame is encoded with WebCodecs H.264 and streamed to the dev server
//                        (vite.config.ts /__cap), which writes trailer/raw/<name>.mp4 at 60 fps CFR.
//   skip(seconds)        advance without recording (warm-up, jumping to a moment).
//   key(code, down)      hold or release a key for scripted input.
// Because every frame is a fixed step, the same seed and script reproduce the same footage, at any machine speed.

interface GameApi {
  tick: (ms: number, steps?: number) => void;
  renderer: { domElement: HTMLCanvasElement };
  state: unknown;
}

const STEP = 1000 / 60;

async function post(path: string, body?: BodyInit): Promise<string> {
  const r = await fetch(path, { method: 'POST', body });
  if (!r.ok) throw new Error(`${path} -> ${r.status} ${await r.text()}`);
  return r.text();
}

export function installTrailer(game: GameApi): void {
  const canvas = game.renderer.domElement;

  const take = async (name: string, seconds: number) => {
    const encodeErrors: string[] = [];
    await post(`/__cap/open?name=${name}`);
    let pending: Uint8Array[] = [];
    let sending: Promise<string> = Promise.resolve('');
    const flush = () => {
      if (!pending.length) return;
      const parts = pending;
      pending = [];
      const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
      let o = 0;
      for (const p of parts) {
        out.set(p, o);
        o += p.length;
      }
      sending = sending.then(() => post(`/__cap/frame?name=${name}`, out));
    };
    const enc = new VideoEncoder({
      output: (chunk) => {
        const b = new Uint8Array(chunk.byteLength);
        chunk.copyTo(b);
        pending.push(b);
        if (pending.length >= 30) flush();
      },
      error: (e) => encodeErrors.push(String(e)),
    });
    enc.configure({
      codec: 'avc1.640033',
      width: canvas.width,
      height: canvas.height,
      bitrate: 40_000_000,
      framerate: 60,
      latencyMode: 'quality',
      hardwareAcceleration: 'prefer-hardware',
      avc: { format: 'annexb' },
    } as VideoEncoderConfig);
    const frames = Math.round(seconds * 60);
    const log: unknown[] = [];
    for (let f = 0; f < frames; f++) {
      game.tick(STEP);
      // snapshot the drawing buffer in the same task the frame was rendered in
      const vf = new VideoFrame(canvas, { timestamp: Math.round(f * (1e6 / 60)), duration: Math.round(1e6 / 60) });
      enc.encode(vf, { keyFrame: f % 60 === 0 });
      vf.close();
      if (f % 30 === 0) log.push({ f, state: game.state });
      while (enc.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 1));
    }
    await enc.flush();
    enc.close();
    flush();
    await sending;
    const close = JSON.parse(await post(`/__cap/close?name=${name}`));
    await post(`/__cap/file?name=${name}&ext=json`, JSON.stringify({ name, frames, size: [canvas.width, canvas.height], log }, null, 1));
    return { name, frames, encodeErrors, close };
  };

  const skip = (seconds: number) => game.tick(STEP, Math.round(seconds * 60));
  const key = (code: string, down: boolean) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code }));

  (window as unknown as { __trailer: unknown }).__trailer = { take, skip, key, ready: true };
  console.info('[trailer] window.__trailer ready');
}
