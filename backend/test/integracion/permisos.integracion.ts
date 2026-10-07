import { randomUUID } from 'node:crypto';
import { RequestMethod, type INestApplication } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { DiscoveryService, MetadataScanner } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { AUDIENCIA_API } from '../../src/auth/sesion';
import { arrancarAplicacion } from './aplicacion';

/**
 * Quién puede llamar a cada ruta, con la aplicación montada entera.
 *
 * Las guardias y el interceptor de solo lectura tenían sus pruebas, pero
 * cada una por separado. Que una ruta lleve su @Roles, o que app.module
 * registre el interceptor, no lo comprobaba nadie: si un cambio le quitaba
 * @Roles(ADMIN) al reembolso, cualquier cliente —o la administración de
 * demostración, cuya contraseña es pública— podía reembolsar, y todo seguía
 * en verde.
 *
 * Aquí se arranca AppModule con la configuración de main.ts y se llama a
 * cada ruta con cada tipo de cuenta. Las rutas se sacan de la propia
 * aplicación: una ruta nueva que no esté en la tabla hace fallar la prueba,
 * y hay que decidir quién puede llamarla antes de publicarla.
 *
 * «Pasa» quiere decir que ninguna guardia la para: la respuesta será un 400
 * por el cuerpo vacío o un 404 por el identificador inventado, que es lo que
 * se busca. Nada llega a cambiar.
 */

const QUIENES = [
  'anonimo',
  'cliente',
  'profesional',
  'administracion',
  'demostracion',
] as const;
type Quien = (typeof QUIENES)[number];
type Esperado = 'pasa' | 401 | 403;
type Fila = Record<Quien, Esperado>;

const ESCRIBEN = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const escribe = (ruta: string) => ESCRIBEN.has(ruta.split(' ')[0]);

/** Sin sesión. Ninguna guardia de cuenta, así que tampoco la de solo lectura. */
const publica = (): Fila => ({
  anonimo: 'pasa',
  cliente: 'pasa',
  profesional: 'pasa',
  administracion: 'pasa',
  demostracion: 'pasa',
});

/**
 * Con cualquier sesión. La administración de demostración mira, pero no
 * escribe: el interceptor de solo lectura la para en todo lo que no es GET.
 */
const conSesion =
  () =>
  (ruta: string): Fila => ({
    anonimo: 401,
    cliente: 'pasa',
    profesional: 'pasa',
    administracion: 'pasa',
    demostracion: escribe(ruta) ? 403 : 'pasa',
  });

/**
 * Solo con uno de esos roles. La administración de demostración tiene el de
 * administración, así que pasa donde pasa ella, y solo para leer.
 */
const solo =
  (...roles: Array<'cliente' | 'profesional' | 'administracion'>) =>
  (ruta: string): Fila => ({
    anonimo: 401,
    cliente: roles.includes('cliente') ? 'pasa' : 403,
    profesional: roles.includes('profesional') ? 'pasa' : 403,
    administracion: roles.includes('administracion') ? 'pasa' : 403,
    demostracion:
      roles.includes('administracion') && !escribe(ruta) ? 'pasa' : 403,
  });

const MATRIZ: Record<string, (ruta: string) => Fila> = {
  // Acceso y cuenta
  'POST /api/auth/register': publica,
  'POST /api/auth/login': publica,
  'POST /api/auth/token': publica,
  'POST /api/auth/logout': publica,
  'POST /api/auth/recuperar': publica,
  'POST /api/auth/restablecer': publica,
  'POST /api/auth/cambiar-contrasena': conSesion(),
  'GET /api/auth/socket-ticket': conSesion(),
  'GET /api/auth/profile': conSesion(),
  'GET /api/users/me': conSesion(),
  'PUT /api/users/profile': conSesion(),
  'GET /api/users/me/datos': conSesion(),
  'POST /api/users/me/eliminar': conSesion(),

  // Administración
  'GET /api/users': solo('administracion'),
  'GET /api/users/:id': solo('administracion'),
  'PATCH /api/users/:id/toggle-active': solo('administracion'),
  'GET /api/admin/metricas': solo('administracion'),
  'GET /api/admin/reputacion': solo('administracion'),
  'GET /api/admin/auditoria': solo('administracion'),
  'GET /api/ia/consumo': solo('administracion'),
  'POST /api/categories': solo('administracion'),
  'PUT /api/categories/:id': solo('administracion'),
  'DELETE /api/categories/:id': solo('administracion'),
  'GET /api/reviews/reported': solo('administracion'),
  'PATCH /api/reviews/:id/dismiss-report': solo('administracion'),
  'DELETE /api/reviews/:id': solo('administracion'),

  // Catálogo
  'GET /api/categories': publica,
  'GET /api/categories/:id': publica,
  'GET /api/services/search': publica,
  'GET /api/services/:id': publica,
  'GET /api/services/provider/:providerId': publica,
  'GET /api/services/mine': solo('profesional'),
  'POST /api/services': solo('profesional'),
  'PUT /api/services/:id': solo('profesional'),
  // Sin rol: el servicio comprueba que sea del profesional o que quien
  // borra sea la administración.
  'DELETE /api/services/:id': conSesion(),

  // Reservas y pagos
  'POST /api/bookings': solo('cliente'),
  'GET /api/bookings/my': conSesion(),
  'GET /api/bookings/received': solo('profesional'),
  'GET /api/bookings/:id': conSesion(),
  // Cada transición comprueba quién la pide: ver bookings.service.ts.
  'PATCH /api/bookings/:id/status': conSesion(),
  'POST /api/payments/create-intent': solo('cliente'),
  'POST /api/payments/confirm/:paymentIntentId': conSesion(),
  'POST /api/payments/capture/:bookingId': solo('administracion'),
  'POST /api/payments/refund/:bookingId': solo('administracion'),
  'GET /api/payments/my': conSesion(),
  'GET /api/payments/booking/:bookingId': conSesion(),
  // La firma de Stripe es la que lo protege.
  'POST /api/payments/webhook': publica,

  // Valoraciones
  'GET /api/reviews/service/:serviceId': publica,
  'GET /api/reviews/my': conSesion(),
  'POST /api/reviews': solo('cliente'),
  'PATCH /api/reviews/:id/response': solo('profesional'),
  'PATCH /api/reviews/:id/report': conSesion(),

  // Mensajes y avisos
  'POST /api/messages': conSesion(),
  'POST /api/messages/conversation/:conversationId': conSesion(),
  'GET /api/messages/conversations': conSesion(),
  'GET /api/messages/conversation/:partnerId': conSesion(),
  'PATCH /api/messages/conversation/:partnerId/read': conSesion(),
  'GET /api/messages/unread/count': conSesion(),
  'GET /api/notifications': conSesion(),
  'GET /api/notifications/unread/count': conSesion(),
  'PATCH /api/notifications/:id/read': conSesion(),
  'PATCH /api/notifications/read-all': conSesion(),

  // Lo demás
  'GET /api/health': publica,
  'GET /api/health/vivo': publica,
  // Responde 404 a quien no trae el testigo, tenga la sesión que tenga.
  'GET /api/diagnostico/ip': publica,
  'GET /api/ia/estado': publica,
  'POST /api/ia/asistente': publica,
};

/** Las rutas que la aplicación registra de verdad, como «MÉTODO /api/…». */
function rutasDeLaAplicacion(app: INestApplication): string[] {
  const escaner = app.get(MetadataScanner);
  const rutas: string[] = [];

  for (const { instance, metatype } of app
    .get(DiscoveryService)
    .getControllers()) {
    if (!instance || !metatype) continue;
    const base = String(Reflect.getMetadata(PATH_METADATA, metatype) ?? '');
    const prototipo = Object.getPrototypeOf(instance);

    for (const nombre of escaner.getAllMethodNames(prototipo)) {
      const manejador = prototipo[nombre];
      const camino = Reflect.getMetadata(PATH_METADATA, manejador);
      if (camino === undefined) continue;
      const metodo =
        RequestMethod[
          Reflect.getMetadata(METHOD_METADATA, manejador) as RequestMethod
        ];
      const completo = ['api', base, String(camino)]
        .join('/')
        .replace(/\/+/g, '/')
        .replace(/\/$/, '');
      rutas.push(`${metodo} /${completo}`);
    }
  }

  return rutas.sort();
}

describe('Permisos de cada ruta, con la aplicación montada', () => {
  let app: INestApplication;
  let base: string;
  let jwt: JwtService;
  let fuente: DataSource;
  let cerrar: () => Promise<void>;
  const cuentas: Partial<
    Record<Quien, { id: string; email: string; role: string }>
  > = {};
  let visitante = 0;

  beforeAll(async () => {
    ({ app, base, jwt, fuente, cerrar } = await arrancarAplicacion());

    const crear = async (
      quien: Quien,
      role: string,
      extra: { soloLectura?: boolean } = {},
    ) => {
      const email = `permisos-${quien}-${randomUUID().slice(0, 8)}@correo.test`;
      const [{ id }] = await fuente.query(
        `INSERT INTO users
           (email, password, "firstName", "lastName", role, "soloLectura", "esDemostracion")
         VALUES ($1, 'sin-contrasena', 'Prueba', 'Permisos', $2, $3, $3)
         RETURNING id`,
        [email, role, extra.soloLectura ?? false],
      );
      cuentas[quien] = { id, email, role };
    };
    await crear('cliente', 'client');
    await crear('profesional', 'provider');
    await crear('administracion', 'admin');
    await crear('demostracion', 'admin', { soloLectura: true });
  });

  afterAll(async () => {
    const ids = Object.values(cuentas).map((c) => c.id);
    if (fuente?.isInitialized && ids.length > 0) {
      await fuente.query(`DELETE FROM users WHERE id = ANY($1)`, [ids]);
    }
    await cerrar?.();
  });

  /**
   * Una sesión nueva en cada petición: cerrar sesión es una de las rutas, y
   * con una sola, la primera vez que pasara dejaría a las demás sin ella.
   */
  function sesion(quien: Quien): string | undefined {
    const cuenta = cuentas[quien];
    if (!cuenta) return undefined;
    return jwt.sign(
      { sub: cuenta.id, email: cuenta.email, role: cuenta.role },
      { audience: AUDIENCIA_API, jwtid: randomUUID() },
    );
  }

  async function llamar(ruta: string, quien: Quien): Promise<number> {
    const [metodo, camino] = ruta.split(' ');
    const token = sesion(quien);
    visitante += 1;
    const respuesta = await fetch(
      `${base}${camino.replace(/:\w+/g, randomUUID())}`,
      {
        method: metodo,
        headers: {
          'content-type': 'application/json',
          // Cada llamada, un visitante distinto: son más de trescientas, y
          // lo que se prueba aquí son los permisos, no el limitador.
          'cf-connecting-ip': `10.9.${visitante >> 8}.${visitante & 255}`,
          ...(token && { authorization: `Bearer ${token}` }),
        },
        body: escribe(ruta) ? '{}' : undefined,
      },
    );
    await respuesta.arrayBuffer();
    return respuesta.status;
  }

  it('cada ruta de la aplicación tiene su fila, y cada fila su ruta', () => {
    const registradas = rutasDeLaAplicacion(app);

    // Si falla aquí: una ruta nueva necesita decidir quién puede llamarla,
    // y una fila sin ruta es una ruta que ya no existe.
    expect(registradas).toEqual(Object.keys(MATRIZ).sort());
  });

  describe.each(Object.keys(MATRIZ))('%s', (ruta) => {
    it.each(QUIENES)('con %s', async (quien) => {
      const esperado = MATRIZ[ruta](ruta)[quien];
      const estado = await llamar(ruta, quien);

      if (esperado === 'pasa') {
        // Ni la sesión ni el rol la paran; tampoco el limitador. Un 5xx
        // sería un fallo del servidor con un cuerpo vacío, que tampoco vale.
        expect(estado, `${ruta} con ${quien}`).not.toBe(401);
        expect(estado, `${ruta} con ${quien}`).not.toBe(403);
        expect(estado, `${ruta} con ${quien}`).not.toBe(429);
        expect(estado, `${ruta} con ${quien}`).toBeLessThan(500);
      } else {
        expect(estado, `${ruta} con ${quien}`).toBe(esperado);
      }
    });
  });
});
