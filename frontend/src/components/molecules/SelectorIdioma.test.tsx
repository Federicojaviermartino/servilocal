import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import es from '../../../messages/es.json';
import SelectorIdioma from './SelectorIdioma';

vi.mock('@/i18n/navigation', async () => {
  const React = await import('react');
  return {
    usePathname: () => '/services/search',
    // Como el de next-intl: la misma ruta, con el prefijo del idioma.
    Link: ({
      href,
      locale,
      children,
      ...resto
    }: {
      href: string;
      locale: string;
      children: React.ReactNode;
    }) =>
      React.createElement(
        'a',
        { href: locale === 'es' ? href : `/${locale}${href}`, ...resto },
        children,
      ),
  };
});

const pintar = () =>
  render(
    <NextIntlClientProvider locale="es" messages={es as never}>
      <SelectorIdioma />
      <p>fuera</p>
    </NextIntlClientProvider>,
  );

const boton = () => screen.getByRole('button', { name: /Cambiar idioma/ });

afterEach(() => {
  window.history.replaceState({}, '', '/');
});

describe('SelectorIdioma', () => {
  it('es un botón que dice qué hace y en qué idioma se está', () => {
    pintar();

    expect(boton()).toHaveAccessibleName('Cambiar idioma: Español');
    expect(boton()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('abre una lista de enlaces, cada uno en su idioma', async () => {
    // Era un desplegable que navegaba al cambiar: con el teclado, la
    // flecha saltaba de idioma y cargaba la página (WCAG 3.2.2).
    pintar();

    await userEvent.click(boton());

    const enlaces = screen.getAllByRole('link');
    expect(enlaces).toHaveLength(10);
    expect(boton()).toHaveAttribute('aria-expanded', 'true');
    const ingles = screen.getByRole('link', { name: 'English' });
    expect(ingles).toHaveAttribute('hrefLang', 'en');
    expect(ingles).toHaveAttribute('lang', 'en');
    expect(screen.getByRole('link', { name: 'Español' })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  it('conserva la página y lo que se buscaba', async () => {
    window.history.replaceState({}, '', '/services/search?q=fontanero');
    pintar();

    await userEvent.click(boton());

    expect(screen.getByRole('link', { name: 'English' })).toHaveAttribute(
      'href',
      '/en/services/search?q=fontanero',
    );
  });

  it('Escape la cierra y devuelve el foco al botón', async () => {
    pintar();
    await userEvent.click(boton());

    await userEvent.keyboard('{Escape}');

    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(boton()).toHaveFocus();
  });

  it('pulsar fuera la cierra', async () => {
    pintar();
    await userEvent.click(boton());

    await userEvent.click(screen.getByText('fuera'));

    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });
});
