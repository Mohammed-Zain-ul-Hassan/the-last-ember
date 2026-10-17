// ?rec=1: record the run as it is seen and heard, start to end, no editing. The page records its own tab
// (getDisplayMedia, preferCurrentTab: the canvas, the captions and HUD, and the tab's sound), streaming the encoded
// chunks to the dev server's capture sink (vite.config.ts /__cap/webopen, /frame, /webclose) as
// trailer/raw/<name>.<ext>. If the tab cannot be captured it falls back to the canvas and the game's own sound.
// (scripts/record-run.mjs launches Chrome with tab capture auto-accepted and background throttling off.)

export interface Recording {
  stop(): Promise<string>;
  kind: 'tab' | 'canvas';
}

const TYPES = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1,opus', 'video/webm;codecs=h264,opus', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];

export async function startRecording(canvas: HTMLCanvasElement, audio: MediaStream | null, name: string): Promise<Recording> {
  let stream: MediaStream;
  let kind: Recording['kind'] = 'tab';
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 60, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: true,
      preferCurrentTab: true,
      selfBrowserSurface: 'include',
    } as DisplayMediaStreamOptions);
  } catch (e) {
    console.warn('[rec] tab capture refused, recording the canvas instead', e);
    kind = 'canvas';
    stream = canvas.captureStream(60);
    for (const tr of audio?.getAudioTracks() ?? []) stream.addTrack(tr);
  }
  const mimeType = TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
  const ext = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
  const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 16_000_000, audioBitsPerSecond: 192_000 });
  await fetch(`/__cap/webopen?name=${name}&ext=${ext}`, { method: 'POST' });
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
  const v = stream.getVideoTracks()[0]?.getSettings();
  console.info(`[rec] recording ${kind} ${v?.width}x${v?.height}@${v?.frameRate} as ${mimeType}, audio tracks: ${stream.getAudioTracks().length}`);
  (window as unknown as { __recInfo: unknown }).__recInfo = { kind, mimeType, w: v?.width, h: v?.height, fps: v?.frameRate, audio: stream.getAudioTracks().length };
  return {
    kind,
    stop: () =>
      new Promise((resolve) => {
        rec.onstop = async () => {
          await chain;
          for (const tr of stream.getTracks()) tr.stop();
          const r = await fetch(`/__cap/webclose?name=${name}`, { method: 'POST' });
          const txt = await r.text();
          console.info(`[rec] done: ${(sent / 1e6).toFixed(1)} MB`, txt);
          resolve(txt);
        };
        rec.stop();
      }),
  };
}
