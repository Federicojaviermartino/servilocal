import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import es from '../../../messages/es.json';
import de from '../../../messages/de.json';
import SearchBar from './SearchBar';

vi.mock('@/i18n/navigation', () => ({
  // Como el de next-intl: la ruta, con el prefijo del idioma.
  getPathname: ({ href, locale }: { href: string; locale: string }) =>
    locale === 'es' ? href : `/${locale}${href}`,
}));

function pintar(idioma: 'es' | 'de', alBuscar = vi.fn()) {
  render(
    <NextIntlClientProvider
      locale={idioma}
      messages={(idioma === 'es' ? es : de) as never}
    >
      <SearchBar onSearch={alBuscar} />
    </NextIntlClientProvider>,
  );
  return alBuscar;
}

describe('SearchBar', () => {
  it('sin JavaScript también busca: va al buscador de su idioma con lo escrito', () => {
    // Con la página ya pintada desde el servidor, pulsar «Buscar» antes de
    // que cargara el JavaScript no hacía nada.
    pintar('de');

    const formulario = screen.getByRole('search');
    expect(formulario).toHaveAttribute('action', '/de/services/search');
    expect(formulario).toHaveAttribute('method', 'get');
    expect(
      screen.getByRole('searchbox', { name: de.buscador.buscarServicios }),
    ).toHaveAttribute('name', 'q');
  });

  it('con JavaScript, lo busca la página, sin recargar', async () => {
    const alBuscar = pintar('es');

    await userEvent.type(
      screen.getByRole('searchbox', { name: es.buscador.buscarServicios }),
      '  fontanero  {Enter}',
    );

    expect(alBuscar).toHaveBeenCalledWith('fontanero');
  });
});
