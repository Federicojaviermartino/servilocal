import { describe, expect, it } from 'vitest';
import { problemasDelEntorno, validarEntorno } from '../../entorno';

const BUENO = {
  NEXT_PUBLIC_API_URL: 'https://servilocal-api.onrender.com/api',
  NEXT_PUBLIC_SITE_URL: 'https://servilocal-web.onrender.com',
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_marcador',
};

describe('El entorno del frontend', () => {
  it('con todo bien puesto no hay nada que decir', () => {
    expect(problemasDelEntorno(BUENO)).toEqual([]);
    expect(() => validarEntorno(BUENO)).not.toThrow();
  });

  it('y sin nada puesto, tampoco: todo tiene su valor por defecto', () => {
    // En local y en la integración continua se compila sin varias de ellas.
    expect(problemasDelEntorno({})).toEqual([]);
    expect(problemasDelEntorno({ NEXT_PUBLIC_API_URL: '  ' })).toEqual([]);
  });

  it.each([
    ['sin protocolo', 'servilocal-api.onrender.com/api', 'no es una dirección'],
    [
      'con otro protocolo',
      'ftp://servilocal-api.onrender.com/api',
      'no es una dirección',
    ],
    [
      'sin /api',
      'https://servilocal-api.onrender.com',
      'tiene que acabar en /api',
    ],
    [
      'con otra ruta',
      'https://servilocal-api.onrender.com/v1',
      'tiene que acabar en /api',
    ],
  ])('la dirección de la API %s no vale', (_caso, valor, esperado) => {
    // Se compilaba igual, con el CSP apuntando a localhost, y lo único que
    // fallaba era el socket, sin decir nada.
    const [problema] = problemasDelEntorno({ NEXT_PUBLIC_API_URL: valor });

    expect(problema).toContain('NEXT_PUBLIC_API_URL');
    expect(problema).toContain(esperado);
  });

  it('la de la API vale con barra final y en local', () => {
    expect(
      problemasDelEntorno({
        NEXT_PUBLIC_API_URL: 'http://localhost:3001/api/',
        API_INTERNA: 'http://api:3001/api',
      }),
    ).toEqual([]);
  });

  it('la interna se mira igual', () => {
    expect(problemasDelEntorno({ API_INTERNA: 'api:3001' })).toEqual([
      expect.stringContaining('API_INTERNA'),
    ]);
  });

  it.each([
    'https://servilocal-web.onrender.com/',
    'https://servilocal-web.onrender.com/es',
    'servilocal-web.onrender.com',
  ])('la del sitio es solo protocolo y dominio: «%s» no vale', (valor) => {
    // Se le pega detrás /sitemap.xml y cada dirección canónica.
    expect(problemasDelEntorno({ NEXT_PUBLIC_SITE_URL: valor })).toEqual([
      expect.stringContaining('NEXT_PUBLIC_SITE_URL'),
    ]);
  });

  it.each(['sk_test_51Abc', 'sk_live_51Abc', 'rk_live_51Abc'])(
    'una clave secreta de Stripe donde va la publicable para la compilación, y no se repite',
    (clave) => {
      // Todo lo que empieza por NEXT_PUBLIC_ acaba en el JavaScript que
      // recibe cualquier visitante.
      const [problema] = problemasDelEntorno({
        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: clave,
      });

      expect(problema).toContain('clave secreta');
      expect(problema).not.toContain(clave);
      expect(() =>
        validarEntorno({ NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: clave }),
      ).toThrow(/no es válido/);
    },
  );

  it('y lo que no es una clave de Stripe, tampoco pasa por una', () => {
    const [problema] = problemasDelEntorno({
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'la-clave-de-stripe',
    });

    expect(problema).toContain('pk_');
    expect(problema).not.toContain('la-clave-de-stripe');
  });

  it('dice todos los problemas a la vez, no el primero', () => {
    const intento = () =>
      validarEntorno({
        NEXT_PUBLIC_API_URL: 'mal',
        NEXT_PUBLIC_SITE_URL: 'peor',
        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'sk_live_x',
      });

    expect(intento).toThrow(/NEXT_PUBLIC_API_URL/);
    expect(intento).toThrow(/NEXT_PUBLIC_SITE_URL/);
    expect(intento).toThrow(/NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY/);
  });
});
