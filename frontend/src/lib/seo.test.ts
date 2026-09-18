import { alternativas, urlDe } from './seo';
import { routing } from '@/i18n/routing';
import { SITIO_URL } from './sitio';

describe('urlDe', () => {
  it('no pone prefijo al idioma por defecto', () => {
    expect(urlDe(routing.defaultLocale, '/services/search')).toBe(
      `${SITIO_URL}/services/search`,
    );
  });

  it('sí lo pone a los demás', () => {
    expect(urlDe('de', '/services/search')).toBe(
      `${SITIO_URL}/de/services/search`,
    );
  });

  it('sirve también para la raíz', () => {
    expect(urlDe('de')).toBe(`${SITIO_URL}/de`);
    expect(urlDe(routing.defaultLocale)).toBe(SITIO_URL);
  });
});

describe('alternativas', () => {
  it('cada idioma es canónico de sí mismo, no de la versión española', () => {
    // Esto estuvo roto: el buscador y las fichas declaraban una canónica sin
    // idioma, así que la versión alemana decía ser la misma URL que la
    // española. Es pedirle a un buscador que no indexe nueve idiomas.
    const alemán = alternativas('de', '/services/search');
    const español = alternativas(routing.defaultLocale, '/services/search');

    expect(alemán.canonical).toBe(`${SITIO_URL}/de/services/search`);
    expect(español.canonical).toBe(`${SITIO_URL}/services/search`);
    expect(alemán.canonical).not.toBe(español.canonical);
  });

  it('declara un idioma por cada uno configurado, más x-default', () => {
    const { languages } = alternativas('de', '/services/search');

    expect(Object.keys(languages)).toHaveLength(routing.locales.length + 1);
    for (const idioma of routing.locales) {
      expect(languages[idioma]).toBeDefined();
    }
    expect(languages['x-default']).toBeDefined();
  });

  it('las alternativas no dependen de en qué idioma se pida', () => {
    // Un buscador que llegue por la versión francesa tiene que ver la misma
    // lista que quien llegue por la alemana; si no, cada página apunta a un
    // grupo distinto y la relación deja de ser recíproca.
    const desdeAlemán = alternativas('de', '/services/x');
    const desdeFrancés = alternativas('fr', '/services/x');

    expect(desdeAlemán.languages).toEqual(desdeFrancés.languages);
  });

  it('cada alternativa apunta a la misma ruta en su idioma', () => {
    const { languages } = alternativas('de', '/services/abc');

    expect(languages.de).toBe(`${SITIO_URL}/de/services/abc`);
    expect(languages.fr).toBe(`${SITIO_URL}/fr/services/abc`);
    expect(languages[routing.defaultLocale]).toBe(`${SITIO_URL}/services/abc`);
  });

  it('x-default es la versión sin prefijo', () => {
    const { languages } = alternativas('ar', '/services/abc');

    expect(languages['x-default']).toBe(`${SITIO_URL}/services/abc`);
  });
});
