#!/usr/bin/env node
/**
 * Render the Club Football "how to play" walkthrough to a single WhatsApp-ready
 * MP4 (H.264 + AAC), narration included.
 *
 *   npm run guide:video
 *
 * How it works: it measures the bundled narration MP3s, plays a self-contained
 * animated HTML timeline synced to those durations, screen-records it with the
 * Playwright Chromium (video only), then muxes the concatenated narration on top
 * with ffmpeg. No servers, no network — just the checked-in assets.
 *
 * Requirements: ffmpeg on your PATH (Windows: `winget install Gyan.FFmpeg`,
 * macOS: `brew install ffmpeg`, Debian/Ubuntu: `sudo apt install ffmpeg`) and
 * the Playwright browser (`npx playwright install chromium`, already in CI).
 */
import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const VO_DIR = join(ROOT, 'apps', 'web', 'public', 'club-vo');
const GUIDE = join(HERE, 'guide.html');
const OUT = join(HERE, 'club-football-guide.mp4');

// Narration order must match the scenes in guide.html.
const ORDER = ['intro', 'markets', 'scoring', 'divisions', 'promo', 'reset', 'trophies', 'meister'];

const FFMPEG = process.env.FFMPEG || 'ffmpeg';

function ffmpeg(args, opts = {}) {
  const r = spawnSync(FFMPEG, args, { encoding: 'utf8', ...opts });
  if (r.error && r.error.code === 'ENOENT') {
    console.error(
      `\n✖ ffmpeg not found (looked for "${FFMPEG}").\n` +
        `  Install it, open a NEW terminal, and re-run:\n` +
        `    Windows: winget install Gyan.FFmpeg   (then reopen the terminal)\n` +
        `    macOS:   brew install ffmpeg\n` +
        `    Ubuntu:  sudo apt install ffmpeg\n` +
        `  Or point FFMPEG at a binary you already have:\n` +
        `    Windows (cmd):  set "FFMPEG=C:\\path\\to\\ffmpeg.exe" && npm run guide:video\n` +
        `    macOS/Linux:    FFMPEG=/path/to/ffmpeg npm run guide:video\n`,
    );
    process.exit(1);
  }
  return r;
}

/** Duration of an audio file in seconds, parsed from ffmpeg's banner. */
function durationOf(file) {
  const r = ffmpeg(['-i', file]);
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  const m = out.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
  if (!m) throw new Error(`Could not read duration of ${file}`);
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

async function main() {
  // 0) Sanity: assets present.
  for (const id of ORDER) {
    const f = join(VO_DIR, `${id}.mp3`);
    if (!existsSync(f)) throw new Error(`Missing narration: ${f}`);
  }
  // Verify ffmpeg is usable up front (nice error if not).
  ffmpeg(['-version']);

  // 1) Measure narration durations; add a hair of padding so audio never clips.
  const durations = ORDER.map((id) => durationOf(join(VO_DIR, `${id}.mp3`)) + 0.35);
  const total = durations.reduce((a, b) => a + b, 0);
  console.log(
    `▶ ${ORDER.length} scenes, ${total.toFixed(1)}s total:\n  ` +
      ORDER.map((id, i) => `${id} ${durations[i].toFixed(1)}s`).join(' · '),
  );

  // 2) Record the animated HTML timeline (video only).
  const work = mkdtempSync(join(tmpdir(), 'club-guide-'));
  const videoDir = join(work, 'video');
  console.log('▶ recording animation with Playwright Chromium…');
  // Honour an explicit Chromium path (useful in CI / preinstalled images); else
  // use Playwright's managed browser (run `npx playwright install chromium` once).
  const executablePath = process.env.PW_CHROMIUM_PATH || undefined;
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    recordVideo: { dir: videoDir, size: { width: 1280, height: 720 } },
  });
  const page = await context.newPage();
  await page.addInitScript((d) => {
    window.SCENE_DURATIONS = d;
  }, durations);
  await page.goto(pathToFileURL(GUIDE).href);
  await page.waitForFunction(() => window.__done === true, null, {
    timeout: Math.ceil(total * 1000) + 15000,
  });
  await page.waitForTimeout(300);
  await context.close(); // flushes the .webm
  await browser.close();

  const webm = readdirSync(videoDir)
    .filter((f) => f.endsWith('.webm'))
    .map((f) => join(videoDir, f))[0];
  if (!webm) throw new Error('Playwright did not produce a video file');

  // 3) Concatenate the narration into one track.
  const listFile = join(work, 'audio.txt');
  writeFileSync(
    listFile,
    ORDER.map((id) => `file '${join(VO_DIR, `${id}.mp3`).replace(/'/g, "'\\''")}'`).join('\n'),
  );
  const audio = join(work, 'audio.m4a');
  console.log('▶ building narration track…');
  let r = ffmpeg([
    '-y',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    listFile,
    '-c:a',
    'aac',
    '-b:a',
    '160k',
    audio,
  ]);
  if (r.status !== 0) {
    console.error(r.stderr);
    throw new Error('ffmpeg failed to concatenate narration');
  }

  // 4) Mux video + narration into a WhatsApp-friendly MP4.
  console.log('▶ muxing final MP4…');
  r = ffmpeg([
    '-y',
    '-i',
    webm,
    '-i',
    audio,
    '-map',
    '0:v:0',
    '-map',
    '1:a:0',
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '20',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '160k',
    '-movflags',
    '+faststart',
    '-shortest',
    OUT,
  ]);
  if (r.status !== 0) {
    console.error(r.stderr);
    throw new Error('ffmpeg failed to mux the MP4');
  }

  rmSync(work, { recursive: true, force: true });
  console.log(`\n✅ Done → ${OUT}`);
  console.log('   Share it straight into a WhatsApp chat.');
}

main().catch((e) => {
  console.error('\n✖', e.message);
  process.exit(1);
});
