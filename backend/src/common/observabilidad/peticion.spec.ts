import type { AddressInfo } from 'node:net';
import {
  ArgumentsHost,
  CanActivate,
  Controller,
  Get,
  Injectable,
  Logger,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import express from 'express';
import { FiltroDeExcepciones } from '../filters/excepciones.filter';
import {
  RegistroConPeticion,
  identificarPeticion,
  idPeticionActual,
} from './peticion';

const ambito = { setContext: vi.fn(), setUser: vi.fn(), setTag: vi.fn() };
vi.mock('./sentry', () => ({
  Sentry: {
    withScope: (hacer: (a: typeof ambito) => void) => hacer(ambito),
    captureException: vi.fn(),
  },
}));

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Un servidor que contesta con el identificador que ve el código. */
async function servidor() {
  const app = express();
  app.use(identificarPeticion);
  app.get('/eco', async (_peticion, respuesta) => {
    // Tras una espera de verdad: el contexto tiene que sobrevivir a los
    // await, que es donde se pierde si no se propaga bien.
    await new Promise((r) => setTimeout(r, 20));
    respuesta.json({ id: idPeticionActual() });
  });
  const escuchando = app.listen(0, '127.0.0.1');
  await new Promise((r) => escuchando.once('listening', r));
  const { port } = escuchando.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${port}`,
    cerrar: () => new Promise((r) => escuchando.close(r)),
  };
}

describe('identificador de petición', () => {
  let s: Awaited<ReturnType<typeof servidor>>;
  beforeAll(async () => {
    s = await servidor();
  });
  afterAll(() => s.cerrar());

  it('cada petición recibe uno, y es el mismo que ve el código', async () => {
    const respuesta = await fetch(`${s.base}/eco`);
    const { id } = await respuesta.json();

    expect(id).toMatch(UUID);
    expect(respuesta.headers.get('x-request-id')).toBe(id);
  });

  it('respeta el que llega de fuera si tiene buena forma', async () => {
    const respuesta = await fetch(`${s.base}/eco`, {
      headers: { 'x-request-id': 'reserva-7f3a9c21' },
    });

    expect((await respuesta.json()).id).toBe('reserva-7f3a9c21');
  });

  it.each([
    ['con espacios', 'uno dos tres cuatro'],
    ['demasiado corto', 'abc'],
    ['demasiado largo', 'a'.repeat(65)],
    ['con caracteres raros', 'abc<script>def'],
  ])('uno %s se sustituye por uno nuevo', async (_caso, recibido) => {
    // Lo que llega de fuera va a parar al registro: con espacios o saltos
    // podría fabricar líneas que parecieran de otra petición.
    const respuesta = await fetch(`${s.base}/eco`, {
      headers: { 'x-request-id': recibido },
    });

    expect((await respuesta.json()).id).toMatch(UUID);
  });

  it('dos peticiones a la vez no se mezclan', async () => {
    const [una, otra] = await Promise.all([
      fetch(`${s.base}/eco`).then((r) => r.json()),
      fetch(`${s.base}/eco`).then((r) => r.json()),
    ]);

    expect(una.id).not.toBe(otra.id);
  });

  it('fuera de una petición no hay ninguno', () => {
    expect(idPeticionActual()).toBeUndefined();
  });
});

@Controller('eco')
class ControladorEco {
  @Get()
  async eco() {
    await new Promise((r) => setTimeout(r, 20));
    return { id: idPeticionActual() };
  }
}

/** Un guarda que también lo lee, como haría cualquiera de los de verdad. */
@Injectable()
class GuardaQueMira implements CanActivate {
  static visto: string | undefined;
  canActivate() {
    GuardaQueMira.visto = idPeticionActual();
    return true;
  }
}

describe('dentro de una aplicación Nest', () => {
  it('el identificador llega igual al guarda y al controlador', async () => {
    // Entre el middleware y el controlador están los guardas, los
    // interceptores y las tuberías de Nest: si alguno perdiera el contexto,
    // las líneas del registro de una petición saldrían sin él.
    const modulo = await Test.createTestingModule({
      controllers: [ControladorEco],
      providers: [{ provide: APP_GUARD, useClass: GuardaQueMira }],
    }).compile();
    const app = modulo.createNestApplication();
    app.use(identificarPeticion);
    await app.listen(0, '127.0.0.1');

    try {
      const url = (await app.getUrl()).replace('[::1]', '127.0.0.1');
      const respuesta = await fetch(`${url}/eco`);
      const { id } = await respuesta.json();

      expect(id).toMatch(UUID);
      expect(GuardaQueMira.visto).toBe(id);
      expect(respuesta.headers.get('x-request-id')).toBe(id);
    } finally {
      await app.close();
    }
  });
});

/** Ejecuta algo como si estuviera atendiendo una petición con ese id. */
function dentroDePeticion(id: string, hacer: () => void) {
  identificarPeticion(
    { headers: { 'x-request-id': id } } as never,
    { setHeader: () => undefined } as never,
    hacer,
  );
}

describe('RegistroConPeticion', () => {
  afterEach(() => vi.restoreAllMocks());

  function capturar() {
    const salida: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((texto) => {
      salida.push(String(texto));
      return true;
    });
    // eslint-disable-next-line no-control-regex
    return () => salida.join('').replace(/\u001b\[[0-9;]*m/g, '');
  }

  it('pone el identificador en cada línea escrita durante la petición', () => {
    const texto = capturar();
    const registro = new RegistroConPeticion('Pagos');

    dentroDePeticion('reserva-7f3a9c21', () => registro.log('cobro hecho'));

    expect(texto()).toContain('[Pagos] [reserva-7f3a9c21] cobro hecho');
  });

  it('fuera de una petición la línea sale como siempre', () => {
    const texto = capturar();

    new RegistroConPeticion('Arranque').log('escuchando');

    expect(texto()).toContain('[Arranque] escuchando');
    expect(texto()).not.toMatch(/\[Arranque\] \[/);
  });
});

describe('el identificador en Sentry', () => {
  it('va como etiqueta con cada error del servidor', () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status: () => ({ json: () => undefined }) }),
        getRequest: () => ({ method: 'GET', url: '/api/algo' }),
      }),
    } as unknown as ArgumentsHost;

    dentroDePeticion('reserva-7f3a9c21', () =>
      new FiltroDeExcepciones().catch(new Error('roto'), host),
    );

    expect(ambito.setTag).toHaveBeenCalledWith(
      'id_peticion',
      'reserva-7f3a9c21',
    );
  });
});
