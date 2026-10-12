// Renders the Android and iOS launcher icons and splash screens from
// src/assets/img/icon.svg, the vector trace of the extension's toolbar icon,
// so the app looks like the extension it is.
//
//   node tools/icons/gen-app-icons.mjs
//
// Chrome draws the SVG into a canvas at each size (headless, its own throwaway
// profile), so the PNGs are the browser's rendering of the same file the
// extension's icon came from. Set SYRIUS_CHROME to use another Chrome.
//
// Written into android/app/src/main/res:
//   mipmap-*/ic_launcher.png             square tile, before Android 8
//   mipmap-*/ic_launcher_round.png       round tile, before Android 8
//   mipmap-*/ic_launcher_foreground.png  adaptive icon foreground: the S within
//                                        the 66dp safe circle of 108dp
//   values/ic_launcher_background.xml    adaptive icon background colour
//   drawable*/splash.png                 the S centred on the app background
//
// and into ios/App/App/Assets.xcassets:
//   AppIcon.appiconset/AppIcon-512@2x.png  1024px square; iOS rounds the corners
//   Splash.imageset/*.png                  the S centred on the app background
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../..');
const res = path.join(root, 'android/app/src/main/res');
const assets = path.join(root, 'ios/App/App/Assets.xcassets');
const svg = fs.readFileSync(path.join(root, 'src/assets/img/icon.svg'), 'utf8');
// The app's own background, --background in Popup.scss (hsl 0 0% 8%).
const background = '#141414';

const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const jobs = [];
for (const [density, scale] of Object.entries(densities)) {
  const tile = Math.round(48 * scale);
  jobs.push({ dir: res, file: `mipmap-${density}/ic_launcher.png`, width: tile, height: tile, shape: 'square', logo: 0.62 });
  jobs.push({ dir: res, file: `mipmap-${density}/ic_launcher_round.png`, width: tile, height: tile, shape: 'circle', logo: 0.6 });
  const layer = Math.round(108 * scale);
  jobs.push({ dir: res, file: `mipmap-${density}/ic_launcher_foreground.png`, width: layer, height: layer, shape: 'none', logo: 0.5 });
}
// Splash screens keep the sizes the platform template gave them.
const splashes = (dir, match) => {
  if (!fs.existsSync(dir)) return;
  for (const file of fs.readdirSync(dir, { recursive: true })) {
    if (!match(String(file))) continue;
    const png = fs.readFileSync(path.join(dir, file));
    // PNG IHDR: width and height, big-endian, at bytes 16 and 20.
    jobs.push({ dir, file, width: png.readUInt32BE(16), height: png.readUInt32BE(20), shape: 'fill', logo: 0.22 });
  }
};
splashes(res, (file) => path.basename(file) === 'splash.png');
if (fs.existsSync(assets)) {
  // Filled to the edge: iOS masks the corners, and an icon with transparent
  // corners shows them black.
  jobs.push({ dir: assets, file: 'AppIcon.appiconset/AppIcon-512@2x.png', width: 1024, height: 1024, shape: 'fill', logo: 0.62 });
  splashes(path.join(assets, 'Splash.imageset'), (file) => file.endsWith('.png'));
}

const findChrome = () => [
  process.env.SYRIUS_CHROME,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean).find((candidate) => fs.existsSync(candidate));

// Runs in the page: one PNG (base64) per job.
const render = async ({ svg: source, jobs: list, background: fill }) => {
  const image = new Image();
  image.src = `data:image/svg+xml;base64,${btoa(source)}`;
  await image.decode();
  return list.map(({ width, height, shape, logo }) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const g = canvas.getContext('2d');
    g.imageSmoothingQuality = 'high';
    const side = Math.min(width, height);
    if (shape === 'fill') {
      g.fillStyle = fill;
      g.fillRect(0, 0, width, height);
    } else if (shape === 'square') {
      g.fillStyle = fill;
      g.beginPath();
      g.roundRect(0, 0, width, height, side * 0.18);
      g.fill();
    } else if (shape === 'circle') {
      g.fillStyle = fill;
      g.beginPath();
      g.arc(width / 2, height / 2, side / 2, 0, Math.PI * 2);
      g.fill();
    }
    const size = side * logo;
    g.drawImage(image, (width - size) / 2, (height - size) / 2, size, size);
    return canvas.toDataURL('image/png').split(',')[1];
  });
};

const chrome = findChrome();
if (!chrome) throw new Error('No Chrome found. Point SYRIUS_CHROME at one.');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'syrius-icons-'));
const port = 9300 + Math.floor(Math.random() * 500);
const browser = spawn(chrome, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });

try {
  let target;
  for (let attempt = 0; attempt < 50 && !target; attempt += 1) {
    try {
      target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page');
    } catch (error) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  if (!target) throw new Error('Headless Chrome did not start');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve) => { ws.onopen = resolve; });
  const reply = await new Promise((resolve) => {
    ws.onmessage = (event) => resolve(JSON.parse(event.data));
    ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: {
      expression: `(${render})(${JSON.stringify({ svg, jobs, background })})`,
      awaitPromise: true, returnByValue: true,
    } }));
  });
  ws.close();
  const images = reply.result?.result?.value;
  if (!Array.isArray(images)) throw new Error(`Rendering failed: ${JSON.stringify(reply.result?.exceptionDetails || reply)}`);
  jobs.forEach((job, index) => fs.writeFileSync(path.join(job.dir, job.file), Buffer.from(images[index], 'base64')));
  fs.writeFileSync(path.join(res, 'values/ic_launcher_background.xml'),
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${background}</color>\n</resources>\n`);
  console.log(`Wrote ${jobs.length} images`);
} finally {
  browser.kill();
  setTimeout(() => fs.rmSync(profile, { recursive: true, force: true }), 500);
}
