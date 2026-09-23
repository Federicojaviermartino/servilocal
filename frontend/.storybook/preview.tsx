import React, { useEffect } from 'react';
import type { Decorator, Preview } from '@storybook/nextjs';
import { NextIntlClientProvider } from 'next-intl';
import {
  NOMBRES_IDIOMA,
  direccionDe,
  routing,
  type Idioma,
} from '../src/i18n/routing';
import ar from '../messages/ar.json';
import ca from '../messages/ca.json';
import de from '../messages/de.json';
import en from '../messages/en.json';
import es from '../messages/es.json';
import eu from '../messages/eu.json';
import fr from '../messages/fr.json';
import gl from '../messages/gl.json';
import it from '../messages/it.json';
import pt from '../messages/pt.json';
import '../src/app/globals.css';

const CATALOGOS: Record<Idioma, typeof es> = {
  es,
  en,
  ca,
  gl,
  eu,
  fr,
  de,
  it,
  pt,
  ar,
};

/**
 * Los componentes piden sus textos al catálogo del idioma activo y sus colores
 * a los tokens semánticos, así que sin proveedor ni clase de tema no se pintan
 * como en la aplicación. Ambos se exponen en la barra para poder comprobar de
 * un vistazo el árabe de derecha a izquierda o el contraste en oscuro.
 */
// Con mayúscula porque usa hooks, y para React —y para las reglas de hooks—
// eso lo convierte en un componente.
const ConIdiomaYTema: Decorator = (Story, contexto) => {
  const idioma = contexto.globals.idioma as Idioma;
  const oscuro = contexto.globals.tema === 'oscuro';

  useEffect(() => {
    const raiz = document.documentElement;
    raiz.classList.toggle('dark', oscuro);
    raiz.lang = idioma;
    raiz.dir = direccionDe(idioma);
  }, [idioma, oscuro]);

  return (
    <NextIntlClientProvider locale={idioma} messages={CATALOGOS[idioma]}>
      <div className="bg-fondo p-6 text-principal">
        <Story />
      </div>
    </NextIntlClientProvider>
  );
};

const preview: Preview = {
  decorators: [ConIdiomaYTema],
  globalTypes: {
    idioma: {
      description: 'Idioma de la interfaz',
      toolbar: {
        title: 'Idioma',
        icon: 'globe',
        items: routing.locales.map((idioma) => ({
          value: idioma,
          title: NOMBRES_IDIOMA[idioma],
        })),
        dynamicTitle: true,
      },
    },
    tema: {
      description: 'Tema claro u oscuro',
      toolbar: {
        title: 'Tema',
        icon: 'circlehollow',
        items: [
          { value: 'claro', title: 'Claro', icon: 'sun' },
          { value: 'oscuro', title: 'Oscuro', icon: 'moon' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    idioma: routing.defaultLocale,
    tema: 'claro',
  },
  parameters: {
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    // El fondo lo pone el decorador con los tokens del tema; el de Storybook
    // solo taparía el que de verdad se quiere revisar.
    backgrounds: { disable: true },
    a11y: { test: 'error' },
  },
};

export default preview;
