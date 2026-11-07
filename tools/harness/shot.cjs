// tools/harness/shot.cjs — capturas de las páginas del arnés con EMULACIÓN MÓVIL real
// (viewport 390×844, dpr 2, touch) vía Chrome DevTools Protocol sobre Edge headless.
//
// Motivo: desde Edge 157 `--window-size=390,844` ya no da un viewport de 390 px
// (mínimo ~500 px) y las capturas salían recortadas a la derecha. CDP con
// Emulation.setDeviceMetricsOverride sí respeta el ancho pedido.
//
// Uso (con el servidor del arnés levantado en :3100):
//   node tools/harness/shot.cjs --out <carpeta> [--w=390 --h=844 --dpr=2 --wait=2500]
//        nombre=tools/harness/catalog.html nombre2="tools/harness/raffle.html?dark=1" ...
// Cada par nombre=ruta genera <carpeta>/<nombre>.png. La ruta puede ser absoluta (http…)
// o relativa al servidor del arnés (http://localhost:3100/).
// Sin puppeteer: usa el WebSocket global de Node ≥22 y el endpoint /json de Edge.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const EDGE = process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9333;
const BASE = 'http://localhost:3100/';

const args = process.argv.slice(2);
const opt = { out: '.', w: 390, h: 844, dpr: 2, wait: 2500 };
const pages = [];
for (const a of args) {
  const m = a.match(/^--(\w+)=(.*)$/);
  if (m) { opt[m[1]] = isNaN(+m[2]) ? m[2] : +m[2]; continue; }
  if (a === '--out') { opt.out = args[args.indexOf(a) + 1]; continue; }
  if (a === opt.out) continue;
  const eq = a.indexOf('=');
  if (eq > 0) pages.push({ name: a.slice(0, eq), url: a.slice(eq + 1) });
}
if (!pages.length) { console.error('Sin páginas: nombre=ruta …'); process.exit(1); }
fs.mkdirSync(opt.out, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const userData = path.join(require('node:os').tmpdir(), 'pp-shot-profile');
  const edge = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${userData}`, 'about:blank',
  ], { stdio: 'ignore' });

  let version = null;
  for (let i = 0; i < 50 && !version; i++) {
    try { version = await (await fetch(`http://localhost:${PORT}/json/version`)).json(); }
    catch { await sleep(200); }
  }
  if (!version) { edge.kill(); throw new Error('Edge no abrió el puerto de depuración'); }

  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let seq = 0;
  const pending = new Map();
  const events = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    else if (msg.method) events.push(msg);
  };
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
    const id = ++seq;
    pending.set(id, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result)));
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Page.enable', {}, sessionId);
  // La consola de la página se imprime con prefijo [page] (sirve para los
  // arneses que verifican comportamiento, p. ej. redeem.html?clicks=1).
  await send('Runtime.enable', {}, sessionId);
  const origOnMessage = ws.onmessage;
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = (msg.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ');
      if (!/^\[vite\]|%c/.test(text)) console.log(`  [page:${msg.params.type}] ${text}`);
      return;
    }
    origOnMessage(ev);
  };
  await send('Emulation.setDeviceMetricsOverride', {
    width: opt.w, height: opt.h, deviceScaleFactor: opt.dpr, mobile: true, screenWidth: opt.w, screenHeight: opt.h,
  }, sessionId);
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }, sessionId);
  // --ua=chrome (defecto) | whatsapp | instagram | ios-safari | <cadena completa>
  const UAS = {
    chrome:      'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36',
    whatsapp:    'Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36',
    instagram:   'Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36 Instagram 300.0.0.0 Android',
    'ios-safari': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  };
  await send('Emulation.setUserAgentOverride', { userAgent: UAS[opt.ua] || opt.ua || UAS.chrome }, sessionId);

  for (const p of pages) {
    const url = /^https?:/.test(p.url) ? p.url : BASE + p.url.replace(/^\//, '');
    await send('Page.navigate', { url }, sessionId);
    const t0 = Date.now();
    while (Date.now() - t0 < 15000 && !events.some((e) => e.method === 'Page.loadEventFired' && e.sessionId === sessionId)) await sleep(100);
    events.length = 0;
    await sleep(opt.wait);
    if (opt.scroll) {
      // --scroll=N desplaza la ventana y el primer contenedor con scroll interno (hojas/contenedores fixed).
      await send('Runtime.evaluate', { expression: `(() => { window.scrollTo(0, ${opt.scroll});
        const el = [...document.querySelectorAll('*')].find(e => { const s = getComputedStyle(e); return /(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 20; });
        if (el) el.scrollTop = ${opt.scroll}; })()` }, sessionId);
      await sleep(600);
    }
    const { data } = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
    const file = path.join(opt.out, `${p.name}.png`);
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    console.log(`${p.name}  ${fs.statSync(file).size} B  ${url}`);
  }

  try { await send('Browser.close'); } catch { /* ya cerrado */ }
  ws.close();
  edge.kill();
}

main().catch((e) => { console.error(e.message); process.exit(1); });
