import type { ReactElement } from 'react';
import type { Metadata } from 'next';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import es from '../../../messages/es.json';
import de from '../../../messages/de.json';
import ar from '../../../messages/ar.json';
import { SITIO_URL } from '@/lib/sitio';
import HomePage from './page';
import AboutPage, { generateMetadata as metadatosAcercaDe } from './about/page';
import PrivacyPage, {
  generateMetadata as metadatosPrivacidad,
} from './privacy/page';
import TermsPage, { generateMetadata as metadatosTerminos } from './terms/page';
import NoEncontrado from './not-found';
import RutaInexistente from './[...resto]/page';

type Idioma = 'es' | 'de' | 'ar';

const CATALOGOS = { es, de, ar } as Record<
  Idioma,
  Record<string, Record<string, string>>
>;

const push = vi.fn();
const noEncontrado = vi.fn();

const fijarIdioma = vi.fn();

vi.mock('next-intl/server', () => ({
  setRequestLocale: (idioma: string) => fijarIdioma(idioma),
  getTranslations: async ({
    locale,
    namespace,
  }: {
    locale: Idioma;
    namespace: string;
  }) => {
    const seccion = CATALOGOS[locale][namespace];
    return (clave: string) => seccion[clave];
  },
}));

vi.mock('next/navigation', () => ({
  // Como el de Next, corta el renderizado lanzando un error.
  notFound: () => {
    noEncontrado();
    throw new Error('NEXT_NOT_FOUND');
  },
  useParams: () => ({}),
}));

vi.mock('@/i18n/navigation', async () => {
  const React = await import('react');
  return {
    Link: ({ href, children }: { href: string; children: React.ReactNode }) =>
      React.createElement('a', { href }, children),
    // Como el de next-intl: la ruta, con el prefijo del idioma.
    getPathname: ({ href, locale }: { href: string; locale: string }) =>
      locale === 'es' ? href : `/${locale}${href}`,
    useRouter: () => ({ push }),
  };
});

// El asistente tiene sus propias pruebas.
vi.mock('@/components/organisms/AsistenteBusqueda', () => ({
  default: () => null,
}));

/** Lo que sirve una página estática para un idioma, como hace Next. */
const servir = (
  Pagina: (props: {
    params: Promise<{ locale: string }>;
  }) => Promise<ReactElement>,
  idioma: Idioma = 'es',
) => Pagina({ params: Promise.resolve({ locale: idioma }) });

function pintar(pagina: ReactElement, idioma: Idioma = 'es') {
  return render(
    <NextIntlClientProvider
      locale={idioma}
      messages={CATALOGOS[idioma] as never}
    >
      {pagina}
    </NextIntlClientProvider>,
  );
}

type GenerarMetadatos = (props: {
  params: Promise<{ locale: string }>;
}) => Promise<Metadata>;

const metadatos = (generar: GenerarMetadatos, locale: Idioma) =>
  generar({ params: Promise.resolve({ locale }) });

beforeEach(() => {
  push.mockReset();
  noEncontrado.mockReset();
});

describe('Portada', () => {
  it('presenta la plataforma y cómo funciona', () => {
    pintar(<HomePage />);

    expect(
      screen.getByRole('heading', { level: 1, name: es.inicio.heroTitulo }),
    ).toBeInTheDocument();
    expect(screen.getByText(es.inicio.heroSubtitulo)).toBeInTheDocument();
    for (const titulo of [
      es.inicio.cercanosTitulo,
      es.inicio.pagosTitulo,
      es.inicio.valoracionesTitulo,
    ]) {
      expect(
        screen.getByRole('heading', { level: 3, name: titulo }),
      ).toBeInTheDocument();
    }
    const pasos = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(pasos).toHaveLength(3);
    expect(pasos[0]).toHaveTextContent(es.inicio.paso1Titulo);
    expect(pasos[2]).toHaveTextContent(es.inicio.paso3Titulo);
  });

  it('la búsqueda lleva al buscador con lo que se ha escrito', async () => {
    pintar(<HomePage />);

    await userEvent.type(
      screen.getByRole('searchbox', { name: es.buscador.buscarServicios }),
      'fontanero urgente',
    );
    await userEvent.click(
      screen.getByRole('button', { name: es.comun.buscar }),
    );

    expect(push).toHaveBeenCalledWith('/services/search?q=fontanero+urgente');
  });

  it('sin texto, lleva al buscador sin filtrar', async () => {
    pintar(<HomePage />);

    await userEvent.click(
      screen.getByRole('button', { name: es.comun.buscar }),
    );

    expect(push).toHaveBeenCalledTimes(1);
    const destino = push.mock.calls[0][0] as string;
    expect(destino.startsWith('/services/search')).toBe(true);
    expect(destino).not.toContain('q=');
  });

  it('está en el idioma de quien la visita', () => {
    pintar(<HomePage />, 'de');

    expect(
      screen.getByRole('heading', { level: 1, name: de.inicio.heroTitulo }),
    ).toBeInTheDocument();
  });
});

describe('Acerca de', () => {
  it('explica los cuatro pasos y el resto de secciones', async () => {
    pintar(await servir(AboutPage));

    expect(
      screen.getByRole('heading', { level: 1, name: es.acercaDe.titulo }),
    ).toBeInTheDocument();
    for (const titulo of [
      es.acercaDe.comoFunciona,
      es.acercaDe.profesionalesTitulo,
      es.acercaDe.tecnologiaTitulo,
      es.acercaDe.academicoTitulo,
    ]) {
      expect(
        screen.getByRole('heading', { level: 2, name: titulo }),
      ).toBeInTheDocument();
    }
    expect(
      screen.getByRole('heading', {
        level: 3,
        name: `1. ${es.acercaDe.paso1Titulo}`,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        level: 3,
        name: `4. ${es.acercaDe.paso4Titulo}`,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(es.acercaDe.paso4Texto)).toBeInTheDocument();
  });

  it('enlaza con los términos y la privacidad', async () => {
    pintar(await servir(AboutPage));

    expect(
      screen.getByRole('link', { name: 'términos de uso' }),
    ).toHaveAttribute('href', '/terms');
    expect(
      screen.getByRole('link', { name: 'política de privacidad' }),
    ).toHaveAttribute('href', '/privacy');
  });

  it('tiene su propia canónica, no la de la portada', async () => {
    // Heredaba la de la portada y el buscador la tomaba por un duplicado.
    const alemanes = await metadatos(metadatosAcercaDe, 'de');
    const españoles = await metadatos(metadatosAcercaDe, 'es');

    expect(alemanes.title).toBe(de.acercaDe.metaTitulo);
    expect(alemanes.description).toBe(de.acercaDe.metaDescripcion);
    expect(alemanes.alternates?.canonical).toBe(`${SITIO_URL}/de/about`);
    expect(españoles.alternates?.canonical).toBe(`${SITIO_URL}/about`);
  });
});

describe.each([
  {
    nombre: 'Política de privacidad',
    Pagina: PrivacyPage,
    generar: metadatosPrivacidad,
    ruta: '/privacy',
    titulo: 'privacidadTitulo',
    descripcion: 'privacidadDescripcion',
  },
  {
    nombre: 'Términos de uso',
    Pagina: TermsPage,
    generar: metadatosTerminos,
    ruta: '/terms',
    titulo: 'terminosTitulo',
    descripcion: 'terminosDescripcion',
  },
] as const)(
  '$nombre',
  ({ nombre, Pagina, generar, ruta, titulo, descripcion }) => {
    it('el texto legal está en español y se declara así', async () => {
      pintar(await servir(Pagina));

      const articulo = screen.getByRole('article');
      expect(articulo).toHaveAttribute('lang', 'es');
      expect(articulo).toHaveAttribute('dir', 'ltr');
      expect(
        within(articulo).getByRole('heading', { level: 1, name: nombre }),
      ).toBeInTheDocument();
    });

    it('en español no avisa de nada', async () => {
      pintar(await servir(Pagina));

      expect(screen.queryByText(es.legal.avisoIdioma)).toBeNull();
    });

    it('en otro idioma avisa, en ese idioma, de que vale la versión española', async () => {
      // Traducir el articulado cambiaría su alcance jurídico: se deja en
      // español y se explica por qué.
      pintar(await servir(Pagina, 'de'), 'de');

      const aviso = screen.getByText(de.legal.avisoIdioma);
      expect(aviso).toHaveAttribute('lang', 'de');
      expect(aviso).toHaveAttribute('dir', 'ltr');
      expect(
        screen.getByRole('heading', { level: 1, name: nombre }),
      ).toBeInTheDocument();
    });

    it('en árabe, el aviso va de derecha a izquierda y el texto legal no', async () => {
      // Sin el dir del artículo, el castellano heredaría la dirección del
      // documento y se leería alineado al revés.
      pintar(await servir(Pagina, 'ar'), 'ar');

      const aviso = screen.getByText(ar.legal.avisoIdioma);
      expect(aviso).toHaveAttribute('lang', 'ar');
      expect(aviso).toHaveAttribute('dir', 'rtl');
      expect(screen.getByRole('article')).toHaveAttribute('dir', 'ltr');
    });

    it('el título y la descripción van en el idioma de la página', async () => {
      const alemanes = await metadatos(generar, 'de');

      expect(alemanes.title).toBe(de.meta[titulo]);
      expect(alemanes.description).toBe(de.meta[descripcion]);
    });

    it('declara su propia canónica en cada idioma', async () => {
      const alemanes = await metadatos(generar, 'de');
      const españoles = await metadatos(generar, 'es');

      expect(alemanes.alternates?.canonical).toBe(`${SITIO_URL}/de${ruta}`);
      expect(españoles.alternates?.canonical).toBe(`${SITIO_URL}${ruta}`);
      expect(españoles.title).toBe(es.meta[titulo]);
    });
  },
);

describe('Al compartirlas', () => {
  it.each([
    ['acerca de', metadatosAcercaDe, 'metaTitulo', '/de/about'],
    ['privacidad', metadatosPrivacidad, 'privacidadTitulo', '/de/privacy'],
    ['términos', metadatosTerminos, 'terminosTitulo', '/de/terms'],
  ] as const)(
    '%s dice lo suyo, con su imagen, y no lo de la portada',
    async (_c, generar, clave, ruta) => {
      // El openGraph de una página sustituye al del layout: las que solo
      // ponían título se compartían con el de la portada, y sin imagen.
      const metadatos = await generar({
        params: Promise.resolve({ locale: 'de' }),
      });
      const og = metadatos.openGraph as Record<string, unknown>;
      const seccion = clave === 'metaTitulo' ? de.acercaDe : de.meta;

      expect(og.title).toBe((seccion as Record<string, string>)[clave]);
      expect(og.url).toBe(`${SITIO_URL}${ruta}`);
      expect(og.locale).toBe('de');
      expect(og.images).toEqual([
        expect.objectContaining({ width: 1200, height: 630 }),
      ]);
    },
  );
});

describe('Las páginas estáticas', () => {
  it.each([
    ['acerca de', AboutPage],
    ['privacidad', PrivacyPage],
    ['términos', TermsPage],
  ] as const)(
    '%s fija su idioma, para generarse al compilar',
    async (_c, Pagina) => {
      // Sin esto, next-intl lo leía de la petición y cada visita volvía a
      // pintar la página, sin caché.
      fijarIdioma.mockClear();

      await servir(Pagina, 'de');

      expect(fijarIdioma).toHaveBeenCalledWith('de');
    },
  );
});

describe('Contenido de la política de privacidad', () => {
  it('dice qué datos se tratan y para qué', async () => {
    pintar(await servir(PrivacyPage));

    const tabla = screen.getByRole('table');
    // Una fila de cabecera y diez categorías.
    expect(within(tabla).getAllByRole('row')).toHaveLength(11);
    expect(within(tabla).getByText('Datos de cuenta')).toBeInTheDocument();
    expect(
      within(tabla).getByText('Consultas al asistente'),
    ).toBeInTheDocument();
    expect(
      within(tabla).getByText('Historial de moderación'),
    ).toBeInTheDocument();
  });

  it('da un correo de contacto y dice qué ve cualquier visitante', async () => {
    pintar(await servir(PrivacyPage));

    // Ejercer un derecho no puede obligar a hacerlo en público, que era lo
    // único que ofrecía la política: el repositorio.
    const correos = screen.getAllByRole('link', {
      name: 'federicojaviermartino@gmail.com',
    });
    expect(correos).toHaveLength(2);
    for (const enlace of correos) {
      expect(enlace).toHaveAttribute(
        'href',
        'mailto:federicojaviermartino@gmail.com',
      );
    }
    expect(screen.queryByText(/repositorio/)).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Qué ve cualquier visitante' }),
    ).toBeInTheDocument();
  });

  it('enumera los derechos y enlaza con los términos', async () => {
    pintar(await servir(PrivacyPage));

    expect(
      within(screen.getByRole('list')).getAllByRole('listitem'),
    ).toHaveLength(5);
    expect(
      screen.getByRole('link', { name: 'términos de uso' }),
    ).toHaveAttribute('href', '/terms');
  });
});

describe('Contenido de los términos de uso', () => {
  it('tiene sus diez apartados, en orden', async () => {
    pintar(await servir(TermsPage));

    const apartados = screen.getAllByRole('heading', { level: 2 });
    expect(apartados).toHaveLength(10);
    expect(apartados[0]).toHaveTextContent('1. Objeto');
    expect(apartados[4]).toHaveTextContent('5. Reservas y pagos');
    expect(apartados[9]).toHaveTextContent('10. Ley aplicable');
  });

  it('enlaza con la política de privacidad', async () => {
    pintar(await servir(TermsPage));

    expect(
      screen.getByRole('link', { name: 'política de privacidad' }),
    ).toHaveAttribute('href', '/privacy');
  });
});

describe('Página no encontrada', () => {
  it('dice que no existe y ofrece volver al inicio', () => {
    pintar(<NoEncontrado />);

    expect(screen.getByText('404')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: es.noEncontrado.titulo }),
    ).toBeInTheDocument();
    expect(screen.getByText(es.noEncontrado.texto)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: es.noEncontrado.volver }),
    ).toHaveAttribute('href', '/');
  });

  it('está en el idioma de quien navega', () => {
    // Por eso vive dentro del layout con idioma, y no fuera.
    pintar(<NoEncontrado />, 'ar');

    expect(
      screen.getByRole('heading', { level: 1, name: ar.noEncontrado.titulo }),
    ).toBeInTheDocument();
  });
});

describe('Ruta que no existe dentro de un idioma', () => {
  it('responde con la página no encontrada', () => {
    expect(() => RutaInexistente()).toThrow('NEXT_NOT_FOUND');
    expect(noEncontrado).toHaveBeenCalledTimes(1);
  });
});
