#!/usr/bin/env node
/**
 * Prueba de humo contra producción, tras cada despliegue.
 *
 * La integración prueba el código; esto prueba el despliegue: que el commit
 * nuevo es el que está sirviendo, que el proxy del frontend llega a la API
 * sin que Cloudflare lo corte, que la cookie sale con sus atributos, que el
 * socket abre con su pase y que salir cierra la sesión de verdad. Hasta
 * ahora eso se comprobaba a mano después de cada despliegue, cuando alguien
 * se acordaba.
 *
 * Sin dependencias: fetch y WebSocket vienen con Node 22, y el socket se
 * prueba hablando directamente el protocolo de Socket.IO.
 *
 * Variables:
 *   HUMO_WEB, HUMO_API       direcciones; por defecto, las de producción
 *   HUMO_VERSION_WEB/_API    commits que puede estar sirviendo cada uno,
 *                            separados por espacios: el último que tocó su
 *                            carpeta y los que vinieron detrás. Sin ellas no
 *                            se espera a ninguna versión
 *   HUMO_ESPERA_MS           cuánto esperar al despliegue (20 minutos)
 *
 * La cuenta es la de demostración, que se publica en la pantalla de acceso.
 */

const WEB = process.env.HUMO_WEB ?? 'https://servilocal-web.onrender.com';
const API = process.env.HUMO_API ?? 'https://servilocal-api.onrender.com';
const ESPERA_MS = Number(process.env.HUMO_ESPERA_MS ?? 20 * 60 * 1000);
const CUENTA = { email: 'laura@ejemplo.com', password: 'Password123!' };
const EN_PRODUCCION = WEB.startsWith('https://');

const fallos = [];

function comprobar(nombre, bien, detalle = '') {
  console.log(`${bien ? '✓' : '✗'} ${nombre}${detalle ? ` — ${detalle}` : ''}`);
  if (!bien) fallos.push(nombre);
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/** Pide algo sin dejar que un corte de red tumbe la prueba entera. */
async function pedir(url, opciones = {}) {
  try {
    return await fetch(url, { ...opciones, signal: AbortSignal.timeout(60_000) });
  } catch (error) {
    return { ok: false, status: 0, error, headers: new Headers() };
  }
}

/**
 * Espera a que el servicio sirva una versión que ya lleve su último cambio.
 * Las instancias gratuitas duermen y tardan en despertar, y el despliegue
 * tarda lo suyo: se pregunta cada quince segundos hasta el tope.
 *
 * No basta con esperar el último commit que tocó su carpeta. Cuando se
 * empujan varios de golpe, Render despliega el último de main en cada
 * servicio cuya carpeta cambió en el tramo, aunque ese último no la toque:
 * la prueba esperaba entonces una versión que nunca iba a llegar. Vale
 * cualquiera desde el último cambio de la carpeta en adelante, que es la
 * lista que le pasa el flujo, y ninguna anterior.
 */
async function esperarVersion(nombre, url, aceptables) {
  const lista = (aceptables ?? '').split(/\s+/).filter(Boolean);
  const hasta = Date.now() + ESPERA_MS;
  let ultima = null;
  while (Date.now() < hasta) {
    const respuesta = await pedir(url);
    if (respuesta.ok) {
      ultima = (await respuesta.json()).version ?? null;
      if (!lista.length) return comprobar(`${nombre} responde`, true);
      if (ultima === null) {
        console.log(
          `::warning::${nombre} no dice qué versión sirve; se prueba lo que haya.`,
        );
        return comprobar(`${nombre} responde`, true, 'sin versión');
      }
      if (lista.some((commit) => commit.startsWith(ultima))) {
        return comprobar(`${nombre} sirve ${ultima}`, true);
      }
    }
    await dormir(15_000);
  }
  comprobar(
    lista.length
      ? `${nombre} sirve ${lista[0].slice(0, 7)} o posterior`
      : `${nombre} responde`,
    false,
    lista.length
      ? `al acabar la espera seguía en ${ultima ?? 'nada'}`
      : 'no ha contestado',
  );
}

/**
 * Abre el socket de mensajes con un pase y dice si el servidor lo acepta.
 *
 * Protocolo de Socket.IO sobre Engine.IO 4: el servidor abre con «0», el
 * cliente pide entrar en el espacio con «40/mensajes,{auth}», el servidor
 * contesta «40/mensajes,{sid}» y, si el pase no vale, manda «sesion-invalida»
 * y cierra. Se espera un momento después de entrar porque la comprobación
 * del pase ocurre justo después de aceptar la conexión.
 */
function probarSocket(pase) {
  return new Promise((resolver) => {
    const direccion =
      API.replace(/^http/, 'ws') + '/socket.io/?EIO=4&transport=websocket';
    const socket = new WebSocket(direccion);
    let dentro = false;
    let terminado = false;
    const fin = (resultado) => {
      if (terminado) return;
      terminado = true;
      clearTimeout(tope);
      try {
        socket.close();
      } catch {
        // Ya cerrado.
      }
      resolver(resultado);
    };
    const tope = setTimeout(() => fin('sin respuesta'), 30_000);

    socket.onmessage = ({ data }) => {
      const texto = String(data);
      if (texto.startsWith('0{')) {
        socket.send('40/mensajes,' + JSON.stringify({ token: pase }));
      } else if (texto === '2') {
        socket.send('3');
      } else if (texto.startsWith('40/mensajes')) {
        dentro = true;
        setTimeout(() => fin(dentro ? 'dentro' : 'rechazado'), 2500);
      } else if (
        texto.startsWith('41/mensajes') ||
        texto.startsWith('44/mensajes') ||
        (texto.startsWith('42/mensajes') && texto.includes('sesion-invalida'))
      ) {
        dentro = false;
        fin('rechazado');
      }
    };
    socket.onerror = () => fin('error');
    socket.onclose = () => fin(dentro ? 'dentro' : 'cerrado');
  });
}

async function main() {
  console.log(`Prueba de humo: ${WEB} y ${API}\n`);

  await esperarVersion('La API', `${API}/api/health`, process.env.HUMO_VERSION_API);
  await esperarVersion('El frontend', `${WEB}/salud`, process.env.HUMO_VERSION_WEB);

  const salud = await pedir(`${API}/api/health`);
  const informe = salud.ok ? await salud.json() : {};
  comprobar('La base de datos responde', informe.baseDeDatos === 'ok');
  comprobar(
    'Cada respuesta lleva su identificador de petición',
    Boolean(salud.headers.get('x-request-id')),
  );

  const portada = await pedir(`${WEB}/`);
  comprobar('La portada carga', portada.status === 200, `${portada.status}`);
  if (EN_PRODUCCION) {
    comprobar(
      'El CSP de producción mejora a https lo que no lo sea',
      (portada.headers.get('content-security-policy') ?? '').includes(
        'upgrade-insecure-requests',
      ),
    );
  }

  const porElFrontend = await pedir(`${WEB}/api/health`);
  comprobar(
    'La API contesta a través del frontend, sin que Cloudflare lo corte',
    porElFrontend.status === 200,
    `${porElFrontend.status}`,
  );
  if (EN_PRODUCCION && porElFrontend.ok) {
    const { atravesDelFrontend } = await porElFrontend.json();
    comprobar(
      'Los dos servicios comparten PROXY_SECRETO',
      atravesDelFrontend === true,
      atravesDelFrontend
        ? ''
        : 'sin él, el límite de peticiones cuenta a todos los visitantes como uno',
    );
  }

  const acceso = await pedir(`${WEB}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: WEB },
    body: JSON.stringify(CUENTA),
  });
  const [puesta = ''] = acceso.headers.getSetCookie?.() ?? [];
  const cuerpo = acceso.ok ? await acceso.json() : {};
  comprobar('Se entra con la cuenta de demostración', acceso.status === 200, `${acceso.status}`);
  comprobar('La cookie es httpOnly', /;\s*HttpOnly/i.test(puesta));
  comprobar('La cookie es SameSite=Lax', /;\s*SameSite=Lax/i.test(puesta));
  if (EN_PRODUCCION) {
    comprobar('La cookie solo viaja por https', /;\s*Secure/i.test(puesta));
  }
  comprobar(
    'El token no viaja en el cuerpo',
    !JSON.stringify(cuerpo).includes('eyJ'),
  );

  const cookie = puesta.split(';')[0];
  const perfil = await pedir(`${WEB}/api/auth/profile`, { headers: { cookie } });
  comprobar('La cookie abre la sesión', perfil.status === 200, `${perfil.status}`);

  const pase = await pedir(`${WEB}/api/auth/socket-ticket`, { headers: { cookie } });
  const { ticket } = pase.ok ? await pase.json() : {};
  comprobar(
    'Se da un pase para el socket, sin caché',
    pase.status === 200 && pase.headers.get('cache-control') === 'no-store',
  );
  if (ticket) {
    const socket = await probarSocket(ticket);
    comprobar('El socket abre con el pase', socket === 'dentro', socket);
  }

  const ajena = await pedir(`${WEB}/api/auth/logout`, {
    method: 'POST',
    headers: { origin: 'https://ajena.example', cookie },
  });
  comprobar('Se rechaza lo que llega de otra web', ajena.status === 403, `${ajena.status}`);

  const salida = await pedir(`${WEB}/api/auth/logout`, {
    method: 'POST',
    headers: { origin: WEB, cookie },
  });
  comprobar('Se sale', salida.status === 204, `${salida.status}`);
  const copia = await pedir(`${WEB}/api/auth/profile`, { headers: { cookie } });
  comprobar(
    'Tras salir, una copia de la cookie ya no vale',
    copia.status === 401,
    `${copia.status}`,
  );

  console.log(
    fallos.length
      ? `\n${fallos.length} ${fallos.length === 1 ? 'comprobación fallida' : 'comprobaciones fallidas'}.`
      : '\nTodo en orden.',
  );
  process.exit(fallos.length ? 1 : 0);
}

main().catch((error) => {
  console.error('La prueba de humo no pudo terminar:', error);
  process.exit(1);
});
