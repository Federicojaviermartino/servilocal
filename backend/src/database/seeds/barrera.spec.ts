import { comprobarDestino, destinoDe, esLocal } from './barrera';

describe('la barrera de la semilla', () => {
  it.each(['localhost', '127.0.0.1', '::1', 'db', 'postgres', 'LOCALHOST'])(
    'siembra sin preguntar en %s',
    (host) => {
      expect(esLocal(host)).toBe(true);
      expect(() =>
        comprobarDestino({ host, baseDeDatos: 'servilocal' }, undefined),
      ).not.toThrow();
    },
  );

  it('se niega con una base en internet si no se confirma', () => {
    // La URL de Neon olvidada en el .env: el siguiente «npm run seed» en
    // local vaciaba la demo entera.
    const neon = {
      host: 'ep-algo-123.eu-central-1.aws.neon.tech',
      baseDeDatos: 'neondb',
    };

    expect(() => comprobarDestino(neon, undefined)).toThrow(
      /SEMILLA_CONFIRMAR=neondb/,
    );
  });

  it('la confirmación tiene que nombrar esa base, no otra', () => {
    const neon = { host: 'ep-algo.neon.tech', baseDeDatos: 'neondb' };

    expect(() => comprobarDestino(neon, 'servilocal')).toThrow();
    expect(() => comprobarDestino(neon, 'neondb')).not.toThrow();
  });

  it('saca el host y la base de DATABASE_URL, que manda sobre el resto', () => {
    expect(
      destinoDe({
        DATABASE_URL:
          'postgresql://usuario:clave@ep-algo.neon.tech/neondb?sslmode=require',
        DB_HOST: 'localhost',
      }),
    ).toEqual({ host: 'ep-algo.neon.tech', baseDeDatos: 'neondb' });
  });

  it('sin DATABASE_URL, las variables sueltas o los valores de desarrollo', () => {
    expect(destinoDe({})).toEqual({
      host: 'localhost',
      baseDeDatos: 'servilocal',
    });
    expect(destinoDe({ DB_HOST: 'db', DB_DATABASE: 'otra' })).toEqual({
      host: 'db',
      baseDeDatos: 'otra',
    });
  });
});
