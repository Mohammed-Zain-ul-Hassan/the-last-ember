// ?rec=1: record the canvas and the game's own sound with MediaRecorder, streamed to the dev server's capture sink
// (vite.config.ts: /__cap/webopen, /__cap/frame, /__cap/webclose), which writes trailer/raw/<name>.webm.
// No editing: what was on screen, start to end.

export interface Recording {
  stop(): Promise<string>;
}

export async function startRecording(canvas: HTMLCanvasElement, audio: MediaStream | null, name: string): Promise<Recording> {
  const stream = canvas.captureStream(60);
  for (const tr of audio?.getAudioTracks() ?? []) stream.addTrack(tr);
  const types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  const mimeType = types.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
  const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 14_000_000, audioBitsPerSecond: 192_000 });
  await fetch(`/__cap/webopen?name=${name}`, { method: 'POST' });
  let chain = Promise.resolve();
  let sent = 0;
  rec.ondataavailable = (e) => {
    if (!e.data.size) return;
    const blob = e.data;
    chain = chain.then(async () => {
      await fetch(`/__cap/frame?name=${name}`, { method: 'POST', body: blob });
      sent += blob.size;
    });
  };
  rec.start(1000);
  console.info(`[rec] recording ${name} as ${mimeType}`);
  return {
    stop: () =>
      new Promise((resolve) => {
        rec.onstop = async () => {
          await chain;
          const r = await fetch(`/__cap/webclose?name=${name}`, { method: 'POST' });
          const txt = await r.text();
          console.info(`[rec] done: ${(sent / 1e6).toFixed(1)} MB`, txt);
          resolve(txt);
        };
        rec.stop();
      }),
  };
}
