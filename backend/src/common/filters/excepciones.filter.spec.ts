import {
  ArgumentsHost,
  BadRequestException,
  ForbiddenException,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
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
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));

  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ method: 'GET', url: '/api/algo', ...peticion }),
    }),
  } as unknown as ArgumentsHost;

  return { filtro: new FiltroDeExcepciones(), host, status, json };
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
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
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
    const registro = jest
      .spyOn(registrador(filtro), 'error')
      .mockImplementation(() => undefined);

    filtro.catch(new BadRequestException('id inválido'), host);

    expect(registro).not.toHaveBeenCalled();
  });

  it('un 5xx sí se registra, con la ruta y el método', () => {
    // La contrapartida de la prueba anterior: si no se registrara ninguno,
    // aquella pasaría por el motivo equivocado.
    const { filtro, host } = construir({ user: { id: 'u1' } });
    const registro = jest
      .spyOn(registrador(filtro), 'error')
      .mockImplementation(() => undefined);

    filtro.catch(new Error('algo se rompió'), host);

    expect(registro).toHaveBeenCalledTimes(1);
    const [resumen] = registro.mock.calls[0] as string[];
    expect(resumen).toContain('GET');
    expect(resumen).toContain('/api/algo');
    expect(resumen).toContain('u1');
  });
});
