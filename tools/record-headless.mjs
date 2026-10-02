import puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      out[key] = true;
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

function loadTrack(trackArg) {
  const candidates = [
    trackArg,
    path.resolve(REPO_ROOT, 'examples/tracks/default.json'),
  ].filter(Boolean);

  for (const c of candidates) {
    const p = path.isAbsolute(c) ? c : path.resolve(process.cwd(), c);
    if (!fs.existsSync(p)) continue;
    try {
      const raw = fs.readFileSync(p, 'utf-8');
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : parsed.nodes;
      if (Array.isArray(list) && list.length >= 2) {
        console.log(`Track file: ${p}`);
        return list;
      }
    } catch (e) {
      console.warn(`Could not parse track ${p}: ${e.message}`);
    }
  }
  throw new Error('No valid track found (need JSON array with >= 2 waypoints).');
}

function printHelp() {
  console.log(`
threejs-cinematic-recorder — headless tour recorder (Puppeteer + FFmpeg)

Usage:
  node tools/record-headless.mjs [options] [track.json]

Options:
  --url <url>        Studio URL (default: http://localhost:8085/index.html)
  --out <file>       Output mp4 (default: ./cinematic-tour.mp4)
  --width <n>        Video width (default: 1920)
  --height <n>       Video height (default: 1080)
  --fps <n>          Frames per second (default: 60)
  --crf <n>          x264 quality 0-51, lower = better (default: 18)
  --preset <s>       x264 preset, e.g. fast, medium, slow (default: fast)
  --chrome <path>    Chrome executable override (default: Puppeteer bundled Chromium)
  --help             Show this help

Examples:
  npm run serve &
  node tools/record-headless.mjs --out ./tour.mp4
  node tools/record-headless.mjs examples/tracks/default.json --width 1280 --height 720 --fps 30
  node tools/record-headless.mjs --url "http://localhost:8085/index.html?model=models/your-model.glb" --out ./tour.mp4
`);
}

async function main() {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);
  if (args.help || args.h) {
    printHelp();
    return;
  }

  const trackPositional = argv.find((a) => !a.startsWith('--') && a.endsWith('.json'));
  const waypoints = loadTrack(args.track || trackPositional);

  const VIDEO_WIDTH = Number(args.width || 1920);
  const VIDEO_HEIGHT = Number(args.height || 1080);
  const VIDEO_FPS = Number(args.fps || 60);
  const CRF = String(args.crf ?? '18');
  const PRESET = String(args.preset || 'fast');
  const SERVER_URL = String(args.url || 'http://localhost:8085/index.html');
  const OUTPUT_FILE = path.resolve(String(args.out || './cinematic-tour.mp4'));
  const chromePath = args.chrome ? String(args.chrome) : undefined;

  if (chromePath && !fs.existsSync(chromePath)) {
    throw new Error(`Chrome executable not found: ${chromePath}`);
  }

  console.log('====================================================');
  console.log('Cinematic tour recorder (Puppeteer + FFmpeg)');
  console.log('====================================================');
  console.log(`Resolution : ${VIDEO_WIDTH}x${VIDEO_HEIGHT} @ ${VIDEO_FPS} FPS`);
  console.log(`Output     : ${OUTPUT_FILE}`);
  console.log(`Spots      : ${waypoints.length} waypoints`);
  console.log(`Studio URL : ${SERVER_URL}\n`);

  console.log('[1/4] Launching headless Chrome...');
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: chromePath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--use-gl=angle',
      '--use-angle=gl-egl',
      '--enable-webgl',
      `--window-size=${VIDEO_WIDTH},${VIDEO_HEIGHT}`,
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: VIDEO_WIDTH, height: VIDEO_HEIGHT });

    console.log(`[2/4] Opening studio (${SERVER_URL})...`);
    await page.goto(SERVER_URL, { waitUntil: 'networkidle0', timeout: 60000 });

    await page.waitForFunction(() => {
      const overlay = document.getElementById('loading-overlay');
      return overlay && overlay.style.display === 'none';
    }, { timeout: 60000 });

    console.log('[3/4] Recording scripted camera tour via FFmpeg...');
    const ffmpeg = spawn('ffmpeg', [
      '-y',
      '-f', 'image2pipe',
      '-vcodec', 'png',
      '-r', String(VIDEO_FPS),
      '-i', '-',
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-preset', PRESET,
      '-crf', CRF,
      OUTPUT_FILE,
    ]);
    ffmpeg.stderr.on('data', () => {});

    const totalDurationSec = waypoints.reduce((acc, wp) => acc + (Number(wp.durationSec) || 4.0), 0);
    const totalFrames = Math.round(totalDurationSec * VIDEO_FPS);
    console.log(`Total duration: ${totalDurationSec}s (${totalFrames} frames)`);

    await page.evaluate((wps) => {
      window.startScriptedTour(wps);
    }, waypoints);

    for (let frame = 0; frame < totalFrames; frame++) {
      const progress = frame / totalFrames;
      await page.evaluate((p) => window.setTourProgress(p), progress);
      const screenshotBuffer = await page.screenshot({ type: 'png', omitBackground: false });
      ffmpeg.stdin.write(screenshotBuffer);
      if (frame % (VIDEO_FPS * 2) === 0 || frame === totalFrames - 1) {
        const percent = Math.round((frame / totalFrames) * 100);
        process.stdout.write(`\rProgress: ${percent}% (${frame}/${totalFrames} frames)`);
      }
    }

    ffmpeg.stdin.end();
    await new Promise((resolve, reject) => {
      ffmpeg.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`FFmpeg exited with code ${code}`))));
    });

    const stats = fs.statSync(OUTPUT_FILE);
    console.log('\n\n====================================================');
    console.log('Done!');
    console.log(`File : ${OUTPUT_FILE}`);
    console.log(`Size : ${(stats.size / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`Time : ${totalDurationSec}s @ ${VIDEO_FPS} FPS`);
    console.log('====================================================');
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('\nRecording failed:', err.message || err);
  process.exit(1);
});
