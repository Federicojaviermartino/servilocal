import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import es from '../../messages/es.json';
import ErrorDePagina from './[locale]/error';
import ErrorGlobal from './global-error';

/**
 * Las dos pantallas que solo aparecen cuando ya ha fallado algo.
 *
 * Antes no existían: un error de renderizado en producción dejaba la
 * pantalla por defecto de Next, en inglés y sin ninguna salida. Son
 * exactamente el tipo de código que nadie prueba porque «no se ejecuta
 * nunca», y que cuando se ejecuta es el único que queda en pie.
 */
const ERROR = Object.assign(new Error('algo reventó'), { digest: 'abc123' });

function pintarPagina(error: Error & { digest?: string } = ERROR) {
  const reiniciar = vi.fn();
  render(
    <NextIntlClientProvider locale="es" messages={es as never}>
      <ErrorDePagina error={error} reset={reiniciar} />
    </NextIntlClientProvider>,
  );
  return reiniciar;
}

describe('Pantalla de error de página', () => {
  beforeEach(() => {
    // El componente vuelca el error a la consola a propósito; sin esto la
    // salida de las pruebas se llena de ruido rojo que no es un fallo.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('se anuncia como aviso, no solo se ve', async () => {
    // Quien navega con lector de pantalla no se entera de que la página ha
    // cambiado a una pantalla de error si no se le dice.
    pintarPagina();

    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('está en el idioma de quien navega', async () => {
    pintarPagina();

    expect(screen.getByText(es.error.titulo)).toBeInTheDocument();
    expect(screen.getByText(es.error.texto)).toBeInTheDocument();
  });

  it('el botón reintenta sin recargar la página', async () => {
    // Recargar pierde lo que hubiera a medias. `reset` vuelve a pintar el
    // trozo que falló y ya está.
    const reiniciar = pintarPagina();

    await userEvent.click(
      screen.getByRole('button', { name: es.error.reintentar }),
    );

    expect(reiniciar).toHaveBeenCalledTimes(1);
  });

  it('y hay una salida aunque reintentar no arregle nada', async () => {
    pintarPagina();

    expect(
      screen.getByRole('link', { name: es.error.volver }),
    ).toBeInTheDocument();
  });

  it('enseña la referencia, que es lo que une lo que se vio con el registro', async () => {
    pintarPagina();

    expect(
      screen.getByText(es.error.referencia.replace('{codigo}', 'abc123')),
    ).toBeInTheDocument();
  });

  it('sin referencia no se inventa una', async () => {
    // Next solo la asigna a los errores del servidor. Enseñar «Referencia:
    // undefined» sería peor que no enseñar nada.
    pintarPagina(new Error('sin digest') as Error & { digest?: string });

    expect(screen.queryByText(/Referencia/)).not.toBeInTheDocument();
  });

  it('deja el error en la consola para quien vaya a mirar', async () => {
    pintarPagina();

    expect(console.error).toHaveBeenCalledWith(ERROR);
  });
});

describe('Pantalla de error global', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.history.pushState({}, '', '/');
  });

  /**
   * Pinta su propio <html> y su propio <body>, así que no se puede montar
   * dentro del <div> de siempre sin que React proteste. Se monta suelto y se
   * busca dentro de lo que devuelve.
   */
  function pintarGlobal() {
    const reiniciar = vi.fn();
    const { container } = render(
      <ErrorGlobal error={ERROR} reset={reiniciar} />,
      { container: document.documentElement },
    );
    return { reiniciar, container };
  }

  it('saca el idioma de la dirección, que es lo único fiable a esas alturas', async () => {
    window.history.pushState({}, '', '/fr/services/search');
    pintarGlobal();

    expect(screen.getByRole('heading').textContent).toBe(
      'Une erreur est survenue',
    );
  });

  it('y con un idioma que no existe no se queda en blanco', async () => {
    window.history.pushState({}, '', '/xx/lo-que-sea');
    pintarGlobal();

    expect(screen.getByRole('heading').textContent).toBe('Algo ha fallado');
  });

  it('en la raíz, que no lleva prefijo, tampoco', async () => {
    // El idioma por defecto se sirve sin prefijo, así que el primer trozo de
    // la dirección no es un idioma y hay que resolverlo igual.
    window.history.pushState({}, '', '/');
    pintarGlobal();

    expect(screen.getByRole('heading').textContent).toBe('Algo ha fallado');
  });

  it('en árabe también cambia la dirección del texto', async () => {
    window.history.pushState({}, '', '/ar');
    pintarGlobal();

    expect(document.documentElement).toHaveAttribute('dir', 'rtl');
  });

  it('el botón reintenta', async () => {
    const { reiniciar } = pintarGlobal();

    await userEvent.click(screen.getByRole('button'));

    expect(reiniciar).toHaveBeenCalledTimes(1);
  });
});
