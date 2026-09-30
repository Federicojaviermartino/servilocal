import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  rutaConConsulta,
  rutaInterna,
  useParametroDeLaDireccion,
} from './ruta-interna';

describe('rutaInterna', () => {
  it.each(['/dashboard', '/services/abc/book', '/services/search?q=pintor'])(
    'deja pasar una página de aquí: %s',
    (ruta) => {
      expect(rutaInterna(ruta)).toBe(ruta);
    },
  );

  it.each([
    ['una dirección completa', 'https://servi1ocal.example/relogin'],
    ['una sin protocolo', '//servi1ocal.example'],
    ['una con la barra invertida', '/\\servi1ocal.example'],
    ['una con un tabulador en medio', '/\t/servi1ocal.example'],
    ['una ruta relativa', 'dashboard'],
    ['javascript:', 'javascript:alert(1)'],
  ])('manda a la portada %s', (_caso, ruta) => {
    // Un enlace así llevaba a quien acababa de entrar a una página ajena
    // que podía pedirle la contraseña otra vez.
    expect(rutaInterna(ruta)).toBe('/');
  });

  it('sin parámetro, a la portada', () => {
    expect(rutaInterna(null)).toBe('/');
    expect(rutaInterna('')).toBe('/');
  });
});

describe('rutaConConsulta', () => {
  it('añade la consulta de la página, que se perdía', () => {
    window.history.replaceState({}, '', '/de/services/search?q=grifo');

    // La ruta llega ya sin el prefijo de idioma: el enrutador lo repone.
    expect(rutaConConsulta('/services/search')).toBe(
      '/services/search?q=grifo',
    );
    window.history.replaceState({}, '', '/');
  });

  it('sin consulta, la ruta tal cual', () => {
    expect(rutaConConsulta('/dashboard')).toBe('/dashboard');
  });

  it('en el servidor, donde no hay dirección, también la ruta tal cual', () => {
    vi.stubGlobal('window', undefined);
    try {
      expect(rutaConConsulta('/dashboard')).toBe('/dashboard');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('useParametroDeLaDireccion', () => {
  afterEach(() => window.history.replaceState(null, '', '/'));

  it('en el navegador, lee la consulta', () => {
    window.history.replaceState(null, '', '/messages/p1?servicio=abc');

    const { result } = renderHook(() => useParametroDeLaDireccion('servicio'));

    expect(result.current).toBe('abc');
  });

  it('en el servidor no hay dirección: se pinta sin él', () => {
    // Y se completa al hidratar. Si leyera window en el servidor, la página
    // entera fallaría al pintarse allí.
    window.history.replaceState(null, '', '/messages/p1?servicio=abc');
    const Parametro = () =>
      createElement(
        'span',
        null,
        useParametroDeLaDireccion('servicio') ?? 'sin parámetro',
      );

    expect(renderToString(createElement(Parametro))).toContain('sin parámetro');
  });
});
