// Las capturas del README, sacadas de la aplicación de verdad.
//
// Se hacían a mano, y se quedaron en las de la 1.1.0: sin los selectores de
// idioma y tema, y sin las pantallas que más enseñan, como la
// administración con sus gráficas, el asistente o la mensajería. Así se
// rehacen todas de una vez, iguales cada vez.
//
// Contra la aplicación sembrada y en marcha (por ejemplo, docker compose):
//
//   node scripts/capturas.mjs [http://localhost:3000] [nombre…]
//
// Con nombres, solo esas capturas.
//
// Escribe en docs/screenshots.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Con paleta, las capturas pesan un tercio: a doble densidad y con fotos,
// entre las catorce pasaban de siete megas. sharp llega con Next.js; si no
// está, se guardan tal cual.
const sharp = await import('sharp').then((m) => m.default).catch(() => null);

const BASE = process.argv[2] || 'http://localhost:3000';
const SOLO = process.argv.slice(3);

// Escribe datos —una conversación para la captura de la mensajería—, así
// que solo contra una instancia local, nunca contra la demo publicada.
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  console.error(`Solo contra una instancia local: ${BASE} no lo es.`);
  process.exit(1);
}
const DESTINO = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../docs/screenshots',
);
const ESCRITORIO = { width: 1440, height: 900 };
const MOVIL = { width: 390, height: 844 };
const CUENTAS = {
  cliente: 'laura@ejemplo.com',
  profesional: 'carlos@ejemplo.com',
  administracion: 'demo@servilocal.com',
};

mkdirSync(DESTINO, { recursive: true });
const navegador = await chromium.launch();

/** Una pestaña con su tamaño, su tema y, si hace falta, su sesión. */
async function pestana({ tamano = ESCRITORIO, oscuro = false, cuenta } = {}) {
  const contexto = await navegador.newContext({
    viewport: tamano,
    deviceScaleFactor: 2,
    locale: 'es-ES',
    colorScheme: oscuro ? 'dark' : 'light',
  });
  await contexto.addInitScript(
    (tema) => {
      localStorage.setItem('tema', tema);
    },
    oscuro ? 'oscuro' : 'claro',
  );
  const pagina = await contexto.newPage();
  if (cuenta) {
    await pagina.goto(`${BASE}/auth/login`);
    await pagina
      .getByRole('button', { name: new RegExp(CUENTAS[cuenta]) })
      .click();
    await pagina.waitForURL((url) => !url.pathname.includes('/auth/login'));
  }
  return { contexto, pagina };
}

/** Espera a que no quede nada cargando, y un poco más para las transiciones. */
async function quieta(pagina) {
  await pagina.waitForLoadState('networkidle');
  await pagina.waitForTimeout(600);
}

async function capturar(nombre, preparar, opciones = {}) {
  if (SOLO.length > 0 && !SOLO.includes(nombre)) return;
  const { contexto, pagina } = await pestana(opciones);
  try {
    await preparar(pagina);
    await quieta(pagina);
    const imagen = await pagina.screenshot();
    writeFileSync(
      join(DESTINO, `${nombre}.png`),
      sharp
        ? await sharp(imagen)
            .png({
              palette: true,
              quality: 90,
              effort: 10,
              compressionLevel: 9,
            })
            .toBuffer()
        : imagen,
    );
    console.log(`✓ ${nombre}`);
  } finally {
    await contexto.close();
  }
}

const primeraFicha = async (pagina) => {
  await pagina.goto(`${BASE}/services/search`);
  const enlace = pagina
    .locator('a[href^="/services/"]:not([href*="search"])')
    .first();
  await enlace.waitFor();
  return enlace.getAttribute('href');
};

await capturar('home', async (p) => {
  await p.goto(BASE);
});

await capturar('search', async (p) => {
  await p.goto(`${BASE}/services/search`);
  await p.getByRole('heading', { level: 1 }).waitFor();
});

await capturar(
  'search-dark',
  async (p) => {
    await p.goto(`${BASE}/services/search`);
    await p.getByRole('heading', { level: 1 }).waitFor();
  },
  { oscuro: true },
);

await capturar('search-map', async (p) => {
  // Una ciudad y no el país entero: con todos los servicios, el mapa se
  // encuadraba a escala de la Península y los marcadores se amontonaban.
  await p.goto(`${BASE}/services/search?view=map&city=Madrid`);
  await p.locator('.leaflet-marker-icon').first().waitFor();
  // Los mosaicos del mapa llegan de fuera: se les da tiempo.
  await p.waitForTimeout(2500);
});

// La de la cabecera del README, que está en inglés. Los servicios siguen en
// castellano: son los que escribieron los profesionales de la semilla.
await capturar('search-en', async (p) => {
  await p.goto(`${BASE}/en/services/search`);
  await p.getByRole('heading', { level: 1 }).waitFor();
});
await capturar('search-arabic', async (p) => {
  await p.goto(`${BASE}/ar/services/search`);
  await p.getByRole('heading', { level: 1 }).waitFor();
});

await capturar('service-detail', async (p) => {
  await p.goto(`${BASE}${await primeraFicha(p)}`);
  await p.getByRole('heading', { level: 1 }).waitFor();
});

await capturar('demo-login', async (p) => {
  await p.goto(`${BASE}/auth/login`);
});

await capturar('assistant', async (p) => {
  await p.goto(`${BASE}/services/search`);
  await p
    .getByRole('button', { name: 'Abrir el asistente de búsqueda' })
    .click();
  const dialogo = p.getByRole('dialog', { name: 'Cuéntanos qué necesitas' });
  await dialogo
    .getByRole('textbox')
    .fill('Se me ha roto el grifo de la cocina en Madrid');
  await dialogo.getByRole('button', { name: 'Buscar', exact: true }).click();
  await dialogo.getByText('Hemos buscado:').waitFor();
});

await capturar(
  'admin',
  async (p) => {
    await p.goto(`${BASE}/admin`);
    await p.getByRole('tablist').waitFor();
    // Las gráficas se cargan aparte y Recharts anima al pintarlas. Sin
    // página entera: cambiar el tamaño a mitad de la animación las dejaba
    // en blanco.
    await p.locator('.recharts-surface').first().waitFor();
    await p.waitForTimeout(2500);
  },
  { cuenta: 'administracion', tamano: { width: 1440, height: 1200 } },
);

await capturar(
  'provider-inbox',
  async (p) => {
    await p.goto(`${BASE}/dashboard/bookings-received`);
    await p.getByRole('heading', { level: 1 }).waitFor();
    // Las pendientes, que son las que tienen «Aceptar» y «Rechazar»: con
    // todas, arriba salían las ya cerradas y la bandeja no enseñaba qué
    // decide el profesional.
    await p.getByRole('button', { name: 'Pendientes' }).click();
    await p.getByRole('button', { name: 'Aceptar' }).first().waitFor();
  },
  { cuenta: 'profesional' },
);

await capturar(
  'booking-detail',
  async (p) => {
    await p.goto(`${BASE}/dashboard/bookings`);
    // Una confirmada: la primera de la lista puede ser una cancelada.
    await p.getByRole('button', { name: 'Confirmadas' }).click();
    await p.locator('a[href*="/dashboard/bookings/"]').first().click();
    await p.getByRole('heading', { level: 1 }).waitFor();
  },
  { cuenta: 'cliente' },
);

/**
 * Una conversación de verdad: la semilla no trae ninguna. Solo la primera
 * vez; en las siguientes pasadas se duplicaría.
 */
async function conversacion(p) {
  const acceso = await p.request.post(`${BASE}/api/auth/token`, {
    data: { email: CUENTAS.profesional, password: 'Password123!' },
  });
  const { accessToken, user: carlos } = await acceso.json();
  const hilo = await p.request.get(
    `${BASE}/api/messages/conversation/${carlos.id}`,
  );
  if ((await hilo.json()).length > 0) return carlos.id;

  const primero = await p.request.post(`${BASE}/api/messages`, {
    headers: { origin: BASE },
    data: {
      receiverId: carlos.id,
      content:
        'Hola, Carlos. ¿Podrías pasarte el jueves por la tarde? El grifo de la cocina gotea desde ayer.',
    },
  });
  const { conversationId } = await primero.json();
  await p.request.post(`${BASE}/api/messages/conversation/${conversationId}`, {
    headers: { authorization: `Bearer ${accessToken}` },
    data: {
      content:
        'Hola, Laura. El jueves a las cinco me va bien. Llevo juntas nuevas por si hay que cambiarlas.',
    },
  });
  return carlos.id;
}

await capturar(
  'messages',
  async (p) => {
    const carlos = await conversacion(p);
    await p.goto(`${BASE}/dashboard/messages/${carlos}`);
    await p.getByText('Llevo juntas nuevas').waitFor();
  },
  { cuenta: 'cliente' },
);

await capturar(
  'search-mobile',
  async (p) => {
    await p.goto(`${BASE}/services/search`);
    await p.getByRole('heading', { level: 1 }).waitFor();
  },
  { tamano: MOVIL },
);

await capturar(
  'service-detail-mobile',
  async (p) => {
    await p.goto(`${BASE}${await primeraFicha(p)}`);
    await p.getByRole('heading', { level: 1 }).waitFor();
  },
  { tamano: MOVIL },
);

await navegador.close();
