import { validarEntorno } from './entorno';

/** Lo mínimo con lo que la API arranca en local. */
const LOCAL = {
  JWT_SECRET: 'secreto_solo_para_los_tests',
  STRIPE_SECRET_KEY: 'sk_test_marcador',
};

/** Lo mínimo en producción. */
const PRODUCCION = {
  NODE_ENV: 'production',
  JWT_SECRET: 'x'.repeat(48),
  STRIPE_SECRET_KEY: 'sk_test_marcador',
  DATABASE_URL: 'postgresql://usuario:clave@servidor/base',
  CORS_ORIGINS: 'https://servilocal-web.onrender.com',
  PROXY_SECRETO: 'y'.repeat(32),
};

const fallo = (entorno: Record<string, unknown>): string => {
  try {
    validarEntorno(entorno, () => undefined);
  } catch (error) {
    return (error as Error).message;
  }
  return '';
};

describe('validarEntorno', () => {
  it('con lo mínimo, arranca y no toca nada', () => {
    expect(validarEntorno({ ...LOCAL }, () => undefined)).toEqual(LOCAL);
    expect(fallo(PRODUCCION)).toBe('');
  });

  it.each(['JWT_SECRET', 'STRIPE_SECRET_KEY'])(
    'sin %s no arranca, y lo dice',
    (clave) => {
      expect(fallo({ ...LOCAL, [clave]: ' ' })).toContain(`Falta ${clave}`);
    },
  );

  it('dice todos los problemas a la vez, no el primero', () => {
    const mensaje = fallo({ PORT: 'tres mil' });

    expect(mensaje).toContain('Falta JWT_SECRET');
    expect(mensaje).toContain('Falta STRIPE_SECRET_KEY');
    expect(mensaje).toContain('PORT tiene que ser un número entero');
  });

  describe('en producción', () => {
    it('sin base de datos no arranca: se conectaría a localhost', () => {
      const { DATABASE_URL: _url, ...sinBase } = PRODUCCION;

      expect(fallo(sinBase)).toContain('Falta DATABASE_URL');
      expect(fallo({ ...sinBase, DB_HOST: 'servidor' })).toBe('');
    });

    it('sin orígenes no arranca: la web no podría escribir nada', () => {
      const { CORS_ORIGINS: _origenes, ...sinOrigenes } = PRODUCCION;

      expect(fallo(sinOrigenes)).toContain('Falta CORS_ORIGINS');
      expect(
        fallo({ ...sinOrigenes, FRONTEND_URL: 'https://servilocal.example' }),
      ).toBe('');
    });

    it('con el secreto del ejemplo no arranca: está publicado', () => {
      expect(
        fallo({ ...PRODUCCION, JWT_SECRET: 'servilocal_jwt_secret_dev_2026' }),
      ).toContain('JWT_SECRET es la del ejemplo');
    });

    it('un secreto corto o la falta de PROXY_SECRETO se avisan sin parar', () => {
      const avisos: string[] = [];
      const { PROXY_SECRETO: _proxy, ...sinProxy } = PRODUCCION;

      validarEntorno({ ...sinProxy, JWT_SECRET: 'corto' }, (aviso) =>
        avisos.push(aviso),
      );

      expect(avisos).toHaveLength(2);
      expect(avisos[0]).toContain('JWT_SECRET tiene menos de 32');
      expect(avisos[1]).toContain('Falta PROXY_SECRETO');
    });

    it('en local no se exige nada de eso', () => {
      const avisos: string[] = [];

      validarEntorno({ ...LOCAL }, (aviso) => avisos.push(aviso));

      expect(avisos).toEqual([]);
    });
  });

  it.each([
    ['THROTTLE_LIMIT', '1000', true],
    ['THROTTLE_LIMIT', 'mil', false],
    ['IA_TOPE_MENSUAL_CENTIMOS', '-5', false],
    ['DB_PORT', '5432', true],
  ])('%s=%s es válido: %s', (clave, valor, valido) => {
    expect(fallo({ ...LOCAL, [clave]: valor }) === '').toBe(valido);
  });

  it.each(['true', 'false'])('un interruptor admite «%s»', (valor) => {
    expect(fallo({ ...LOCAL, IA_ACTIVA: valor })).toBe('');
  });

  it.each(['TRUE', 'no', '1'])(
    'y nada más: «%s» hacía justo lo contrario de lo que parecía',
    (valor) => {
      expect(fallo({ ...LOCAL, RETENCIONES_AUTOMATICAS: valor })).toContain(
        'RETENCIONES_AUTOMATICAS tiene que ser «true» o «false»',
      );
    },
  );

  it.each([
    ['0.1', true],
    ['1', true],
    ['2', false],
    ['mucho', false],
  ])('SENTRY_TRACES_SAMPLE_RATE=%s es válido: %s', (valor, valido) => {
    expect(fallo({ ...LOCAL, SENTRY_TRACES_SAMPLE_RATE: valor }) === '').toBe(
      valido,
    );
  });

  it('una dirección con otro protocolo no vale, y no se repite su valor', () => {
    const mensaje = fallo({
      ...LOCAL,
      REDIS_URL: 'http://usuario:clave-secreta@redis',
    });

    expect(mensaje).toContain('REDIS_URL no es una dirección válida');
    // Puede llevar una credencial.
    expect(mensaje).not.toContain('clave-secreta');
  });

  describe('CORS_ORIGINS', () => {
    it('admite varios orígenes separados por comas, y comas de más', () => {
      expect(
        fallo({
          ...LOCAL,
          CORS_ORIGINS: 'https://a.example, http://localhost:3000,',
        }),
      ).toBe('');
    });

    it.each([
      'https://servilocal-web.onrender.com/',
      'https://servilocal-web.onrender.com/es',
      'servilocal-web.onrender.com',
    ])('rechaza «%s»: no coincidiría nunca con Origin', (origen) => {
      expect(fallo({ ...LOCAL, CORS_ORIGINS: origen })).toContain(
        `CORS_ORIGINS lleva «${origen}»`,
      );
    });
  });

  it('una dirección que ni siquiera se puede leer, tampoco', () => {
    expect(fallo({ ...LOCAL, FRONTEND_URL: 'no es una dirección' })).toContain(
      'FRONTEND_URL no es una dirección válida',
    );
  });

  it('los avisos van al registro si no se dice otra cosa', () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    validarEntorno({ ...PRODUCCION, PROXY_SECRETO: '' });

    expect(aviso).toHaveBeenCalledWith(
      expect.stringContaining('Falta PROXY_SECRETO'),
    );
    aviso.mockRestore();
  });
});
