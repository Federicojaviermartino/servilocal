// La imagen que acompaña a un enlace compartido: 1200 × 630, lo que piden
// las redes sociales.
//
// Solo las fichas con foto tenían una; el resto de páginas salían sin
// imagen. Es la misma para los diez idiomas, así que no lleva texto que
// haya que traducir: la marca, su icono y la dirección.
//
//   node scripts/imagen-social.mjs
//
// Escribe src/assets/imagen-social.png.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DESTINO = join(
  dirname(fileURLToPath(import.meta.url)),
  '../src/assets/imagen-social.png',
);

// El icono de la cabecera (MapPin, de lucide), en grande.
const PIN = `<svg xmlns="http://www.w3.org/2000/svg" width="168" height="168" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg>`;

const HTML = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html, body { margin: 0; }
  body {
    width: 1200px; height: 630px; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 28px;
    background: linear-gradient(135deg, #1e40af 0%, #1e3a8a 60%, #1e2a4a 100%);
    font-family: Inter, system-ui, -apple-system, 'Segoe UI', sans-serif;
    color: white;
  }
  .marca { display: flex; align-items: center; gap: 28px; }
  h1 { margin: 0; font-size: 132px; font-weight: 800; letter-spacing: -3px; }
  p { margin: 0; font-size: 34px; opacity: 0.85; letter-spacing: 0.5px; }
</style></head>
<body>
  <div class="marca">${PIN}<h1>ServiLocal</h1></div>
  <p>servilocal-web.onrender.com</p>
</body></html>`;

const navegador = await chromium.launch();
const pagina = await navegador.newPage({
  viewport: { width: 1200, height: 630 },
});
await pagina.setContent(HTML);
const captura = await pagina.screenshot({ type: 'png' });
await navegador.close();

// Con paleta pesa una fracción. sharp llega con Next.js; si no está, se
// guarda tal cual.
const sharp = await import('sharp').then((m) => m.default).catch(() => null);
const png = sharp
  ? await sharp(captura)
      .png({ palette: true, colors: 256, dither: 0, effort: 10 })
      .toBuffer()
  : captura;

mkdirSync(dirname(DESTINO), { recursive: true });
writeFileSync(DESTINO, png);
console.log(`${DESTINO}: ${Math.round(png.length / 1024)} KB`);
