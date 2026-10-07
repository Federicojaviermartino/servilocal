// El recorrido del README, grabado de la aplicación de verdad: buscar,
// abrir una ficha, que el profesional acepte una solicitud y escribirse.
//
// Quien evalúa un proyecto mira la primera pantalla y poco más, y una
// sucesión de capturas no enseña que la aplicación funcione de punta a
// punta. Sin el pago: con las claves de marcador, Stripe no monta su
// formulario.
//
// Contra la aplicación sembrada y en marcha, como scripts/capturas.mjs, y
// mejor recién sembrada: antes de grabar escribe lo que la semilla no trae,
// una solicitud de Laura a Carlos y un mensaje suyo.
//
//   node scripts/recorrido.mjs [http://localhost:3000]
//
// Deja un vídeo en docs/recorrido.webm, que no se versiona; el GIF del
// README se saca de él con ffmpeg, en dos pasadas para que la paleta salga
// del propio vídeo. Con diff_mode=rectangle cada fotograma guarda solo lo
// que cambia: con las opciones por defecto pesaba 7 MB, y así menos de 4.
//
//   ffmpeg -i docs/recorrido.webm -vf "fps=8,scale=840:-1:flags=lanczos,palettegen=stats_mode=diff" paleta.png
//   ffmpeg -i docs/recorrido.webm -i paleta.png -lavfi "fps=8,scale=840:-1:flags=lanczos[v];[v][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" docs/recorrido.gif
import { chromium, request } from '@playwright/test';
import { mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.argv[2] || 'http://localhost:3000';
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  console.error(`Solo contra una instancia local: ${BASE} no lo es.`);
  process.exit(1);
}

const DOCS = join(dirname(fileURLToPath(import.meta.url)), '../../docs');
const TEMPORAL = join(DOCS, '.grabando');
const TAMANO = { width: 1280, height: 720 };

// Lo que el profesional va a aceptar y a contestar, fuera del vídeo y por
// la API. Que sea de Laura, que le escribe, hace que la historia cuadre: la
// semilla reparte sus solicitudes entre otros profesionales y no trae
// ninguna conversación.
const api = await request.newContext({ baseURL: BASE });
const entrar = async (email) => {
  const respuesta = await api.post('/api/auth/token', {
    data: { email, password: 'Password123!' },
  });
  if (!respuesta.ok()) {
    throw new Error(`No se pudo entrar como ${email}: ${respuesta.status()}`);
  }
  return respuesta.json();
};
const laura = await entrar('laura@ejemplo.com');
const carlos = await entrar('carlos@ejemplo.com');
const comoLaura = { authorization: `Bearer ${laura.accessToken}` };

const servicios = await (
  await api.get('/api/services/mine', {
    headers: { authorization: `Bearer ${carlos.accessToken}` },
  })
).json();
const grifos = servicios.find((s) => /grifo/i.test(s.title)) ?? servicios[0];

// El jueves que viene a las cinco, con al menos dos días de margen.
const jueves = new Date();
jueves.setHours(17, 0, 0, 0);
do jueves.setDate(jueves.getDate() + 1);
while (jueves.getDay() !== 4 || jueves.getTime() - Date.now() < 2 * 86_400_000);

for (const [ruta, data] of [
  [
    '/api/bookings',
    {
      serviceId: grifos.id,
      scheduledDate: jueves.toISOString(),
      description: 'The kitchen tap has been dripping since yesterday.',
      totalPrice: Number(grifos.priceMin),
    },
  ],
  [
    '/api/messages',
    {
      receiverId: carlos.user.id,
      content:
        'Hi Carlos, could you come on Thursday afternoon? The kitchen tap has been dripping since yesterday.',
    },
  ],
]) {
  const respuesta = await api.post(ruta, { headers: comoLaura, data });
  if (!respuesta.ok()) {
    throw new Error(`${ruta}: ${respuesta.status()} ${await respuesta.text()}`);
  }
}
await api.dispose();

rmSync(TEMPORAL, { recursive: true, force: true });
mkdirSync(TEMPORAL, { recursive: true });

const navegador = await chromium.launch();
const contexto = await navegador.newContext({
  viewport: TAMANO,
  locale: 'en-GB',
  recordVideo: { dir: TEMPORAL, size: TAMANO },
});
const pagina = await contexto.newPage();
const pausa = (ms = 1200) => pagina.waitForTimeout(ms);

// Buscar, y ver los resultados en el mapa.
await pagina.goto(`${BASE}/en`);
await pausa();
await pagina.getByRole('searchbox').first().pressSequentially('fontan', {
  delay: 90,
});
await pagina.keyboard.press('Enter');
await pagina.getByRole('heading', { level: 1 }).waitFor();
await pausa(1800);
await pagina.getByRole('button', { name: 'Map' }).click();
await pagina.locator('.leaflet-marker-icon').first().waitFor();
// Los marcadores llegan antes que el mapa de debajo: sin esperar a las
// teselas, el vídeo enseñaba chinchetas sobre un fondo gris.
await pagina.locator('.leaflet-tile-loaded').first().waitFor();
await pausa(2800);
await pagina.getByRole('button', { name: 'List' }).click();
await pausa(800);

// Una ficha, con su precio y sus valoraciones.
await pagina
  .locator('a[href*="/services/"]:not([href*="search"])')
  .first()
  .click();
await pagina.getByRole('heading', { level: 1 }).waitFor();
await pausa(1500);
await pagina.mouse.wheel(0, 500);
await pausa(1500);

// El profesional acepta una solicitud que le llegó.
await pagina.goto(`${BASE}/en/auth/login`);
await pagina.getByRole('button', { name: /carlos@ejemplo\.com/ }).click();
await pagina.waitForURL((url) => !url.pathname.includes('/auth/login'));
await pagina.goto(`${BASE}/en/dashboard/bookings-received`);
await pagina.getByRole('heading', { level: 1 }).waitFor();
await pausa();
await pagina.getByRole('button', { name: 'Pending' }).click();
await pausa();
await pagina
  .getByRole('button', { name: /Accept/ })
  .first()
  .click();
await pausa(2200);

// Y le escribe al cliente.
await pagina.goto(`${BASE}/en/dashboard/messages`);
await pagina.getByRole('heading', { level: 1 }).waitFor();
await pagina.locator('a[href*="/dashboard/messages/"]').first().click();
await pagina.getByRole('textbox').last().waitFor();
await pagina
  .getByRole('textbox')
  .last()
  .pressSequentially('See you on Thursday at five.', { delay: 60 });
await pagina.keyboard.press('Enter');
await pausa(2500);

await contexto.close();
await navegador.close();

const [video] = readdirSync(TEMPORAL).filter((f) => f.endsWith('.webm'));
renameSync(join(TEMPORAL, video), join(DOCS, 'recorrido.webm'));
rmSync(TEMPORAL, { recursive: true, force: true });
console.log('docs/recorrido.webm');
