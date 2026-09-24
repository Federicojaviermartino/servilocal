/**
 * La última red: lo que se ve si revienta el propio layout raíz.
 *
 * Cuando falla ahí, no hay proveedor de traducciones —puede ser justo lo que
 * ha fallado— ni layout que envuelva nada, así que este fichero tiene que
 * pintar su propio <html> y su propio <body> y no puede depender de nada del
 * resto de la aplicación.
 *
 * Por eso los textos están aquí sueltos en vez de salir de los catálogos:
 * importarlos metería los diez idiomas en el paquete del navegador para una
 * pantalla que casi nunca aparece, y leerlos por el camino normal es
 * exactamente lo que no se puede dar por hecho llegados a este punto. Son
 * tres frases; el idioma se saca de la dirección, que es lo único que sigue
 * siendo fiable.
 */
'use client';

import { useEffect } from 'react';

const TEXTOS: Record<string, [string, string, string]> = {
  es: [
    'Algo ha fallado',
    'Vuelve a intentarlo en unos segundos.',
    'Reintentar',
  ],
  ca: [
    'Alguna cosa ha fallat',
    'Torna-ho a provar en uns segons.',
    'Torna-ho a provar',
  ],
  gl: ['Algo fallou', 'Téntao de novo nuns segundos.', 'Tentar de novo'],
  eu: [
    'Zerbaitek huts egin du',
    'Saiatu berriro segundo batzuk barru.',
    'Saiatu berriro',
  ],
  en: [
    'Something went wrong',
    'Please try again in a few seconds.',
    'Try again',
  ],
  fr: [
    'Une erreur est survenue',
    'Réessayez dans quelques secondes.',
    'Réessayer',
  ],
  de: [
    'Etwas ist schiefgelaufen',
    'Bitte versuchen Sie es in einigen Sekunden erneut.',
    'Erneut versuchen',
  ],
  it: ['Qualcosa è andato storto', 'Riprova tra qualche secondo.', 'Riprova'],
  pt: [
    'Algo correu mal',
    'Tenta de novo dentro de alguns segundos.',
    'Tentar de novo',
  ],
  ar: ['حدث خطأ ما', 'حاول مرة أخرى بعد بضع ثوانٍ.', 'إعادة المحاولة'],
};

const POR_DEFECTO = 'es';

function idiomaDeLaDireccion(): string {
  if (typeof window === 'undefined') return POR_DEFECTO;
  const primero = window.location.pathname.split('/')[1];
  return primero in TEXTOS ? primero : POR_DEFECTO;
}

export default function ErrorGlobal({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const idioma = idiomaDeLaDireccion();
  const [titulo, texto, reintentar] = TEXTOS[idioma];

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang={idioma} dir={idioma === 'ar' ? 'rtl' : 'ltr'}>
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          // Sin hoja de estilos: si ha fallado el layout raíz, tampoco hay
          // garantía de que Tailwind haya llegado a cargarse.
          fontFamily: 'system-ui, -apple-system, sans-serif',
          background: '#f8fafc',
          color: '#0f172a',
        }}
      >
        <main role="alert" style={{ textAlign: 'center', padding: '2rem' }}>
          <h1 style={{ fontSize: '1.5rem', margin: 0 }}>{titulo}</h1>
          <p style={{ marginTop: '0.5rem', color: '#475569' }}>{texto}</p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: '1.5rem',
              padding: '0.5rem 1rem',
              borderRadius: '0.375rem',
              border: 'none',
              background: '#1d4ed8',
              color: '#fff',
              fontSize: '1rem',
              cursor: 'pointer',
            }}
          >
            {reintentar}
          </button>
          {error.digest && (
            <p
              style={{
                marginTop: '1.5rem',
                fontSize: '0.75rem',
                color: '#64748b',
              }}
            >
              {error.digest}
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
