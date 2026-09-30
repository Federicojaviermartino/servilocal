import { EventEmitter } from 'node:events';
import { anotarApagado } from './apagado';

describe('anotarApagado', () => {
  const crear = () => {
    const proceso = new EventEmitter();
    const registro = { log: vi.fn(), error: vi.fn(), warn: vi.fn() };
    anotarApagado(registro, proceso);
    return { proceso, registro };
  };

  it('dice qué señal llegó', () => {
    const { proceso, registro } = crear();

    proceso.emit('SIGTERM');

    expect(registro.log).toHaveBeenCalledWith(
      expect.stringMatching(/^SIGTERM: se cierran/),
      'Apagado',
    );
  });

  it('también con SIGINT, que es la de la terminal', () => {
    const { proceso, registro } = crear();

    proceso.emit('SIGINT');

    expect(registro.log).toHaveBeenCalledWith(
      expect.stringMatching(/^SIGINT:/),
      'Apagado',
    );
  });

  it('dice con qué código sale el proceso', () => {
    const { proceso, registro } = crear();

    proceso.emit('exit', 1);

    expect(registro.log).toHaveBeenCalledWith(
      'Proceso terminado con código 1',
      'Apagado',
    );
  });

  it('una sola vez aunque la señal se repita', () => {
    // Render puede insistir; el cierre ya está en marcha y Nest ignora la
    // segunda, así que el registro también.
    const { proceso, registro } = crear();

    proceso.emit('SIGTERM');
    proceso.emit('SIGTERM');

    expect(registro.log).toHaveBeenCalledTimes(1);
  });
});
