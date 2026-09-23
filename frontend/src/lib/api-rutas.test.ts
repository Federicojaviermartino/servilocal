import { beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Las rutas que pide el cliente HTTP.
 *
 * Un fallo aquí no rompe la compilación ni salta en desarrollo si esa
 * pantalla no se visita: se descubre en producción con un 404. Y el verbo
 * importa tanto como la ruta, porque el interceptor reintenta los GET que
 * agotan el tiempo: convertir en GET una llamada que cuesta dinero o que
 * crea algo la duplicaría sola.
 */
const llamadas: Array<[string, string]> = [];

vi.mock('axios', () => {
  const registrar =
    (metodo: string) =>
    (ruta: string, ...resto: unknown[]) => {
      llamadas.push([metodo, ruta]);
      return Promise.resolve({ data: null, opciones: resto });
    };

  const instancia = {
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
    get: registrar('get'),
    post: registrar('post'),
    put: registrar('put'),
    patch: registrar('patch'),
    delete: registrar('delete'),
  };

  return {
    default: {
      create: (opciones: { baseURL: string }) => {
        base = opciones.baseURL;
        return instancia;
      },
    },
    AxiosError: class {},
  };
});

let base = '';

type Api = typeof import('./api');
let api: Api;

beforeAll(async () => {
  api = await import('./api');
});

/** Ejecuta la llamada y devuelve el verbo y la ruta que salieron. */
async function pedir(ejecutar: () => unknown): Promise<[string, string]> {
  llamadas.length = 0;
  await ejecutar();
  expect(llamadas).toHaveLength(1);
  return llamadas[0];
}

describe('rutas del cliente HTTP', () => {
  const CASOS: Array<[string, () => unknown, string, string]> = [
    [
      'registro',
      () => api.authApi.register({} as never),
      'post',
      '/auth/register',
    ],
    ['acceso', () => api.authApi.login({} as never), 'post', '/auth/login'],
    ['salida', () => api.authApi.logout(), 'post', '/auth/logout'],
    ['perfil', () => api.authApi.getProfile(), 'get', '/auth/profile'],
    // GET a propósito: las cuentas de demostración no pueden hacer POST, y
    // sin pase se quedarían sin avisos en vivo.
    [
      'pase del socket',
      () => api.authApi.socketTicket(),
      'get',
      '/auth/socket-ticket',
    ],

    ['usuarios', () => api.usersApi.getAll(), 'get', '/users'],
    ['un usuario', () => api.usersApi.getById('u1'), 'get', '/users/u1'],
    [
      'cambiar estado de cuenta',
      () => api.usersApi.toggleActive('u1'),
      'patch',
      '/users/u1/toggle-active',
    ],

    ['categorías', () => api.categoriesApi.getAll(), 'get', '/categories'],
    [
      'crear categoría',
      () => api.categoriesApi.create({} as never),
      'post',
      '/categories',
    ],
    [
      'editar categoría',
      () => api.categoriesApi.update('c1', {}),
      'put',
      '/categories/c1',
    ],
    [
      'borrar categoría',
      () => api.categoriesApi.remove('c1'),
      'delete',
      '/categories/c1',
    ],

    [
      'buscar servicios',
      () => api.servicesApi.search({} as never),
      'get',
      '/services/search',
    ],
    [
      'ficha de servicio',
      () => api.servicesApi.getById('s1'),
      'get',
      '/services/s1',
    ],

    ['avisos', () => api.avisosApi.listar(), 'get', '/notifications'],
    [
      'avisos sin leer',
      () => api.avisosApi.sinLeer(),
      'get',
      '/notifications/unread/count',
    ],
    [
      'marcar un aviso',
      () => api.avisosApi.marcarLeido('a1'),
      'patch',
      '/notifications/a1/read',
    ],
    [
      'marcar todos los avisos',
      () => api.avisosApi.marcarTodos(),
      'patch',
      '/notifications/read-all',
    ],

    [
      'un servicio de un profesional',
      () => api.servicesApi.getByProvider('p1'),
      'get',
      '/services/provider/p1',
    ],
    [
      'publicar servicio',
      () => api.servicesApi.create({}),
      'post',
      '/services',
    ],
    [
      'editar servicio',
      () => api.servicesApi.update('s1', {}),
      'put',
      '/services/s1',
    ],
    [
      'retirar servicio',
      () => api.servicesApi.remove('s1'),
      'delete',
      '/services/s1',
    ],

    [
      'reservar',
      () => api.bookingsApi.create({} as never),
      'post',
      '/bookings',
    ],
    [
      'mis reservas',
      () => api.bookingsApi.getMyBookings(),
      'get',
      '/bookings/my',
    ],
    [
      'reservas recibidas',
      () => api.bookingsApi.getReceived(),
      'get',
      '/bookings/received',
    ],
    ['una reserva', () => api.bookingsApi.getById('b1'), 'get', '/bookings/b1'],
    [
      'avanzar el estado',
      () => api.bookingsApi.updateStatus('b1', 'confirmed'),
      'patch',
      '/bookings/b1/status',
    ],

    ['valorar', () => api.reviewsApi.create({} as never), 'post', '/reviews'],
    [
      'valoraciones de un servicio',
      () => api.reviewsApi.getByService('s1'),
      'get',
      '/reviews/service/s1',
    ],
    [
      'mis valoraciones',
      () => api.reviewsApi.getMyReviews(),
      'get',
      '/reviews/my',
    ],
    [
      'responder a una valoración',
      () => api.reviewsApi.respond('v1', 'Gracias'),
      'patch',
      '/reviews/v1/response',
    ],
    [
      'cola de moderación',
      () => api.reviewsApi.getReported(),
      'get',
      '/reviews/reported',
    ],
    [
      'descartar denuncia',
      () => api.reviewsApi.dismissReport('v1'),
      'patch',
      '/reviews/v1/dismiss-report',
    ],
    [
      'borrar valoración',
      () => api.reviewsApi.remove('v1'),
      'delete',
      '/reviews/v1',
    ],

    [
      'conversaciones',
      () => api.messagesApi.getConversations(),
      'get',
      '/messages/conversations',
    ],
    [
      'un hilo',
      () => api.messagesApi.getConversation('u2'),
      'get',
      '/messages/conversation/u2',
    ],
    [
      'enviar mensaje',
      () => api.messagesApi.send({} as never),
      'post',
      '/messages',
    ],

    [
      'abrir el cobro',
      () => api.paymentsApi.createIntent('b1'),
      'post',
      '/payments/create-intent',
    ],
    [
      'confirmar el cobro',
      () => api.paymentsApi.confirm('pi_1'),
      'post',
      '/payments/confirm/pi_1',
    ],
    [
      'una categoría',
      () => api.categoriesApi.getById('c1'),
      'get',
      '/categories/c1',
    ],

    ['métricas', () => api.adminApi.metricas(), 'get', '/admin/metricas'],
    ['reputación', () => api.adminApi.reputacion(), 'get', '/admin/reputacion'],
    ['auditoría', () => api.adminApi.auditoria(2), 'get', '/admin/auditoria'],
  ];

  it.each(CASOS)('%s', async (_nombre, ejecutar, verbo, ruta) => {
    expect(await pedir(ejecutar)).toEqual([verbo, ruta]);
  });

  it('el asistente se pide por POST, porque cuesta dinero', async () => {
    // El interceptor reintenta las lecturas que agotan el tiempo. Si esta
    // llamada fuera un GET, un tiempo agotado la cobraría dos veces.
    expect(await pedir(() => api.iaApi.asistente('hola'))).toEqual([
      'post',
      '/ia/asistente',
    ]);
  });

  it('la página del historial viaja como parámetro, no pegada a la ruta', async () => {
    // Pegarla daría /admin/auditoria/2, que el servidor no publica.
    llamadas.length = 0;
    await api.adminApi.auditoria(3);

    expect(llamadas[0][1]).toBe('/admin/auditoria');
  });

  it('pide al propio frontend, no a la API directamente', () => {
    // Con la dirección de la API, la cookie de sesión sería de otro sitio y
    // el navegador no la mandaría: ver pasarela-api.ts.
    expect(base).toBe('/api');
  });

  it('ninguna lectura de las que cambian algo usa GET', async () => {
    // Recuento de red: si alguien convierte un POST en GET para «arreglar»
    // un CORS, el interceptor empezaría a repetirlo solo.
    const escrituras = [
      () => api.authApi.login({} as never),
      () => api.authApi.logout(),
      () => api.iaApi.asistente('hola'),
      () => api.categoriesApi.create({} as never),
      () => api.categoriesApi.remove('c1'),
      () => api.usersApi.toggleActive('u1'),
    ];

    for (const escritura of escrituras) {
      const [verbo] = await pedir(escritura);
      expect(verbo).not.toBe('get');
    }
  });
});
