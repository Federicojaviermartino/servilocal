import {
  ArgumentsHost,
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import Stripe from 'stripe';
import { QueryFailedError } from 'typeorm';
import { FiltroDeExcepciones } from './excepciones.filter';

/**
 * Lo que ve quien llama cuando algo se rompe.
 *
 * Es la última línea de todas las peticiones y no la miraba ninguna prueba:
 * el recuento de cobertura solo incluía los servicios, así que este archivo
 * no aparecía ni como pendiente. Lo que decide aquí es qué se cuenta hacia
 * fuera y qué se queda en el registro del servidor, que es justo donde se
 * filtran los detalles internos sin querer.
 */
function construir(peticion: Record<string, unknown> = {}) {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const setHeader = vi.fn();

  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status, setHeader }),
      getRequest: () => ({ method: 'GET', url: '/api/algo', ...peticion }),
    }),
  } as unknown as ArgumentsHost;

  return { filtro: new FiltroDeExcepciones(), host, status, json, setHeader };
}

/** El registrador vive en la instancia, no en el prototipo. */
const registrador = (filtro: FiltroDeExcepciones) =>
  (filtro as unknown as { logger: { error: (...args: unknown[]) => void } })
    .logger;

describe('FiltroDeExcepciones', () => {
  beforeEach(() => {
    // El filtro registra los 5xx, y el registrador de Nest escribe por su
    // cuenta y no por consola: sin silenciarlo ahí, la salida de la batería
    // se llena de trazas de excepciones provocadas a propósito y las que
    // importan de verdad se pierden entre ellas.
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('una excepción HTTP conserva su código y su mensaje', async () => {
    const { filtro, host, status, json } = construir();

    filtro.catch(new NotFoundException('Reserva no encontrada'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Reserva no encontrada' }),
    );
  });

  it.each([
    [new BadRequestException('Falta el importe'), HttpStatus.BAD_REQUEST],
    [new ForbiddenException('No es tuya'), HttpStatus.FORBIDDEN],
  ])('respeta el código de %s', (excepcion, esperado) => {
    const { filtro, host, status } = construir();

    filtro.catch(excepcion, host);

    expect(status).toHaveBeenCalledWith(esperado);
  });

  it('un error cualquiera se convierte en 500 sin contar por qué', () => {
    // El mensaje de un error interno puede llevar dentro una consulta SQL,
    // una ruta del sistema de ficheros o el contenido de una variable. Hacia
    // fuera va una frase fija; el detalle se queda en el registro.
    const { filtro, host, status, json } = construir();

    filtro.catch(new Error('conexión rechazada en 10.0.0.4:5432'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    const cuerpo = json.mock.calls[0][0] as { message: string };
    expect(cuerpo.message).toBe('Error interno del servidor');
    expect(cuerpo.message).not.toContain('10.0.0.4');
  });

  /** Un error de la base con su código de PostgreSQL, como lo da el driver. */
  const errorDeBase = (code: string) =>
    new QueryFailedError(
      'SELECT … WHERE id = $1',
      ['x'],
      Object.assign(new Error('mensaje interno del driver'), { code }),
    );

  it.each([
    ['22P02', HttpStatus.BAD_REQUEST, 'un identificador mal formado'],
    ['23505', HttpStatus.CONFLICT, 'un duplicado'],
    ['23503', HttpStatus.CONFLICT, 'una clave ajena rota'],
    ['23514', HttpStatus.BAD_REQUEST, 'una restricción incumplida'],
    ['22001', HttpStatus.BAD_REQUEST, 'un texto más largo que su columna'],
    ['23502', HttpStatus.BAD_REQUEST, 'un null en un campo obligatorio'],
    ['55P03', HttpStatus.CONFLICT, 'una fila bloqueada demasiado tiempo'],
  ])(
    'un error %s de la base es culpa de la petición: %i, no 500 (%s)',
    (code, esperado) => {
      // La búsqueda pública con ?categoryId=x daba un 500 que cualquiera
      // podía provocar, con su aviso a Sentry.
      const { filtro, host, status, json } = construir();

      filtro.catch(errorDeBase(code), host);

      expect(status).toHaveBeenCalledWith(esperado);
      const cuerpo = json.mock.calls[0][0] as { message: string };
      expect(cuerpo.message).not.toContain('driver');
      expect(cuerpo.message).not.toContain('SELECT');
      // Y no cuenta como fallo del servidor.
      expect(Logger.prototype.error).not.toHaveBeenCalled();
    },
  );

  it('un error de la base sin código conocido sigue siendo un 500', () => {
    const { filtro, host, status, json } = construir();

    filtro.catch(errorDeBase('08006'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Error interno del servidor' }),
    );
  });

  it('lo que se lanza sin ser un Error tampoco se filtra', () => {
    // throw 'algo' es raro pero ocurre, y no debe dejar la respuesta a medias.
    const { filtro, host, status, json } = construir();

    filtro.catch('texto suelto con datos internos', host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Error interno del servidor' }),
    );
  });

  it('siempre contesta algo: nada se queda sin respuesta', () => {
    // Un filtro que lanza dentro deja la petición colgada hasta que expire.
    const { filtro, host, status } = construir({ user: undefined });

    expect(() => filtro.catch(null, host)).not.toThrow();
    expect(status).toHaveBeenCalled();
  });

  it('un 4xx no se registra como fallo del servidor', () => {
    // Que alguien mande un identificador mal formado no es una avería, y
    // anotarlo como error entierra los que sí lo son.
    //
    // Se espía el registrador de la instancia, que es donde vive: la primera
    // versión de esta prueba miraba el del prototipo, que no existe, y
    // acababa espiando la consola. Pasaba aunque el filtro registrara los
    // 4xx, comprobado haciéndolo.
    const { filtro, host } = construir();
    const registro = vi
      .spyOn(registrador(filtro), 'error')
      .mockImplementation(() => undefined);

    filtro.catch(new BadRequestException('id inválido'), host);

    expect(registro).not.toHaveBeenCalled();
  });

  it('un 5xx sí se registra, con la ruta y el método', () => {
    // La contrapartida de la prueba anterior: si no se registrara ninguno,
    // aquella pasaría por el motivo equivocado.
    const { filtro, host } = construir({ user: { id: 'u1' } });
    const registro = vi
      .spyOn(registrador(filtro), 'error')
      .mockImplementation(() => undefined);

    filtro.catch(new Error('algo se rompió'), host);

    expect(registro).toHaveBeenCalledTimes(1);
    const [resumen] = registro.mock.calls[0] as string[];
    expect(resumen).toContain('GET');
    expect(resumen).toContain('/api/algo');
    expect(resumen).toContain('u1');
  });

  it('lo que trae cuándo volver a intentarlo lo dice también en su cabecera', () => {
    // El freno de una cuenta lo manda en el cuerpo, que es lo que lee la
    // interfaz; Retry-After es lo que entiende cualquier otro cliente.
    const { filtro, host, json, setHeader } = construir();

    filtro.catch(
      new HttpException(
        { statusCode: 429, codigo: 'cuenta-frenada', reintentarEn: 540 },
        429,
      ),
      host,
    );

    expect(setHeader).toHaveBeenCalledWith('Retry-After', '540');
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ codigo: 'cuenta-frenada', reintentarEn: 540 }),
    );
  });

  it('y lo demás no lleva esa cabecera', () => {
    const { filtro, host, setHeader } = construir();

    filtro.catch(new NotFoundException('Reserva no encontrada'), host);
    filtro.catch(new BadRequestException(['el correo no es válido']), host);

    expect(setHeader).not.toHaveBeenCalled();
  });

  describe('cuando lo que falla es Stripe', () => {
    const deStripe = (codigo?: string) => ({
      type: 'invalid_request_error' as const,
      message: 'No such payment_intent: pi_3Nx_interno',
      ...(codigo && { code: codigo }),
    });

    it('caído, contesta 503 con su código y cuándo volver a intentarlo', () => {
      // Era un 500 con «Error interno del servidor»: ni era verdad ni le
      // decía a nadie que bastaba con repetirlo en un minuto.
      const { filtro, host, status, json, setHeader } = construir({
        method: 'PATCH',
        url: '/api/bookings/b1/status',
      });

      filtro.catch(new Stripe.errors.StripeConnectionError(deStripe()), host);

      expect(status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
      expect(json).toHaveBeenCalledWith({
        statusCode: 503,
        codigo: 'pagos-no-disponibles',
        message: expect.stringContaining('servicio de pagos'),
      });
      expect(setHeader).toHaveBeenCalledWith('Retry-After', '30');
    });

    it('y sigue siendo un 5xx: queda en el registro, con su traza', () => {
      const { filtro, host } = construir();
      const registro = vi
        .spyOn(registrador(filtro), 'error')
        .mockImplementation(() => undefined);

      filtro.catch(new Stripe.errors.StripeAPIError(deStripe()), host);

      expect(registro).toHaveBeenCalledTimes(1);
    });

    it('lo que dice Stripe no sale hacia fuera', () => {
      // Sus mensajes llevan identificadores de pagos y, con la clave mal, los
      // últimos caracteres de la clave.
      const { filtro, host, json } = construir();

      filtro.catch(
        new Stripe.errors.StripeAuthenticationError(deStripe()),
        host,
      );

      expect(JSON.stringify(json.mock.calls)).not.toContain('pi_3Nx_interno');
    });

    it('una tarjeta rechazada es un 402, y deja una línea sin traza', () => {
      const { filtro, host, status, json, setHeader } = construir({
        method: 'POST',
        url: '/api/payments/capture/b1?x=1',
      });
      const fallo = vi
        .spyOn(registrador(filtro), 'error')
        .mockImplementation(() => undefined);
      const aviso = vi
        .spyOn(
          registrador(filtro) as unknown as { warn: (linea: string) => void },
          'warn',
        )
        .mockImplementation(() => undefined);

      filtro.catch(
        new Stripe.errors.StripeCardError(deStripe('card_declined')),
        host,
      );

      expect(status).toHaveBeenCalledWith(HttpStatus.PAYMENT_REQUIRED);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({ codigo: 'tarjeta-rechazada' }),
      );
      expect(setHeader).not.toHaveBeenCalled();
      expect(fallo).not.toHaveBeenCalled();
      expect(aviso).toHaveBeenCalledWith(
        'POST /api/payments/capture/b1 -> 402: Stripe respondió card_declined',
      );
    });

    it('un pago que ya no está como se creía es un 409', () => {
      const { filtro, host, status, json } = construir();
      vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

      filtro.catch(
        new Stripe.errors.StripeInvalidRequestError(
          deStripe('payment_intent_unexpected_state'),
        ),
        host,
      );

      expect(status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({ codigo: 'pago-en-otro-estado' }),
      );
    });

    it('una petición mal hecha a Stripe es un fallo nuestro: 500, sin código', () => {
      const { filtro, host, status, json } = construir();

      filtro.catch(
        new Stripe.errors.StripeInvalidRequestError(
          deStripe('parameter_invalid_integer'),
        ),
        host,
      );

      expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(json).toHaveBeenCalledWith({
        statusCode: 500,
        message: 'Error interno del servidor',
      });
    });
  });

  it('la ruta se registra sin su consulta, que puede llevar datos de quien pregunta', () => {
    const { filtro, host } = construir({
      url: '/api/services/search?q=calle+mayor+7',
      originalUrl: '/api/v1/services/search?q=calle+mayor+7',
    });
    const registro = vi
      .spyOn(registrador(filtro), 'error')
      .mockImplementation(() => undefined);

    filtro.catch(new Error('algo se rompió'), host);

    const [resumen] = registro.mock.calls[0] as string[];
    expect(resumen).toContain('/api/v1/services/search');
    expect(resumen).not.toContain('calle');
  });
});
