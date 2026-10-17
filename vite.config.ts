import { defineConfig, type Plugin } from 'vite';
import { createWriteStream, mkdirSync, statSync, unlinkSync, writeFileSync, type WriteStream } from 'node:fs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

// Dev-only trailer capture sink for src/trailer.ts (?trailer=1). Takes land in trailer/raw/.
//   POST /__cap/open?name        start a take (WebCodecs H.264 Annex-B stream)
//   POST /__cap/frame?name       append encoded bytes (backpressured)
//   POST /__cap/close?name       finish: remux to 60 fps CFR mp4
//   POST /__cap/file?name&ext    write a side file (frame log json)
function capture(): Plugin {
  const dir = join(import.meta.dirname, 'trailer/raw');
  const takes = new Map<string, { file: WriteStream; path: string; bytes: number; posts: number }>();
  const body = (req: IncomingMessage) =>
    new Promise<Buffer>((res) => {
      const parts: Buffer[] = [];
      req.on('data', (c: Buffer) => parts.push(c));
      req.on('end', () => res(Buffer.concat(parts)));
    });
  const done = (res: ServerResponse, msg: string, code = 200) => {
    res.statusCode = code;
    res.end(msg);
  };
  return {
    name: 'dev-capture',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__cap', async (req, res) => {
        const u = new URL(req.url ?? '', 'http://x');
        const name = (u.searchParams.get('name') ?? 'take').replace(/[^a-z0-9_-]/gi, '');
        mkdirSync(dir, { recursive: true });
        try {
          if (u.pathname === '/open') {
            const path = join(dir, `${name}.h264`);
            takes.set(name, { file: createWriteStream(path), path, bytes: 0, posts: 0 });
            return done(res, 'ok');
          }
          const t = takes.get(name);
          if (u.pathname === '/frame') {
            if (!t) return done(res, 'no take', 404);
            const b = await body(req);
            t.bytes += b.length;
            t.posts++;
            if (!t.file.write(b)) await new Promise((r) => t.file.once('drain', r));
            return done(res, 'ok');
          }
          if (u.pathname === '/close') {
            if (!t) return done(res, 'no take', 404);
            takes.delete(name);
            await new Promise((r) => t.file.end(r));
            const mp4 = join(dir, `${name}.mp4`);
            let log = '';
            const code = await new Promise<number>((r) => {
              // Annex-B from WebCodecs carries no timing: stamp exactly one frame per 1/60 s (CFR)
              const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'h264', '-i', t.path, '-c', 'copy', '-bsf:v', 'setts=ts=N/(60*TB)', '-video_track_timescale', '60000', '-movflags', '+faststart', mp4]);
              ff.stderr.on('data', (d) => (log += String(d)));
              ff.on('close', (c) => r(c ?? 1));
            });
            if (code === 0) unlinkSync(t.path);
            return done(res, JSON.stringify({ path: mp4, code, bytes: t.bytes, posts: t.posts, size: code === 0 ? statSync(mp4).size : 0, log: log.slice(-1500) }));
          }
          // a MediaRecorder take (webm, video and audio), streamed in chunks: the gameplay recording
          if (u.pathname === '/webopen') {
            const ext = (u.searchParams.get('ext') ?? 'webm').replace(/[^a-z0-9]/gi, '');
            const path = join(dir, `${name}.${ext}`);
            takes.set(name, { file: createWriteStream(path), path, bytes: 0, posts: 0 });
            return done(res, 'ok');
          }
          if (u.pathname === '/webclose') {
            if (!t) return done(res, 'no take', 404);
            takes.delete(name);
            await new Promise((r) => t.file.end(r));
            return done(res, JSON.stringify({ path: t.path, bytes: t.bytes, posts: t.posts }));
          }
          if (u.pathname === '/file') {
            const ext = (u.searchParams.get('ext') ?? 'bin').replace(/[^a-z0-9]/gi, '');
            writeFileSync(join(dir, `${name}.${ext}`), await body(req));
            return done(res, 'ok');
          }
          done(res, 'unknown', 404);
        } catch (e) {
          done(res, String(e), 500);
        }
      });
    },
  };
}

export default defineConfig({
  base: './',
  server: { port: 5173, strictPort: true, watch: { ignored: ['**/trailer/**'] } },
  plugins: [capture()],
  // the Still City is the page; the combat game it grew from stays playable at classic.html
  build: { rollupOptions: { input: { main: 'index.html', classic: 'classic.html' } } },
});
