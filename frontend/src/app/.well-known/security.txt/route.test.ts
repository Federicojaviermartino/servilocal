import { afterEach, describe, expect, it, vi } from 'vitest';
import { SITIO_URL } from '@/lib/sitio';
import { GET } from './route';

describe('/.well-known/security.txt', () => {
  afterEach(() => vi.useRealTimers());

  const campos = async () => {
    const respuesta = GET();
    const lineas = (await respuesta.text()).trim().split('\n');
    return {
      respuesta,
      valores: Object.fromEntries(
        lineas.map((linea) => {
          const corte = linea.indexOf(': ');
          return [linea.slice(0, corte), linea.slice(corte + 2)];
        }),
      ),
    };
  };

  it('dice a quién avisar y cuál es la política, en texto plano', async () => {
    const { respuesta, valores } = await campos();

    expect(respuesta.headers.get('content-type')).toBe(
      'text/plain; charset=utf-8',
    );
    expect(valores.Contact).toMatch(/^https:\/\/.+SECURITY\.md$/);
    expect(valores.Policy).toBe(valores.Contact);
    expect(valores.Canonical).toBe(`${SITIO_URL}/.well-known/security.txt`);
  });

  it('lleva su caducidad, que el formato exige, siempre por delante', async () => {
    // Con la fecha fija en un fichero, caducaría sola a los seis meses de no
    // desplegar, y un security.txt caducado no vale.
    vi.useFakeTimers({ now: new Date('2026-10-08T10:00:00Z') });

    const { valores } = await campos();

    expect(valores.Expires).toBe('2027-04-06T10:00:00.000Z');
  });
});
