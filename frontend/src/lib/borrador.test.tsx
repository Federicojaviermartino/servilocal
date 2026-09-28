import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  guardarBorrador,
  leerBorrador,
  olvidarBorrador,
  useBorrador,
} from './borrador';

afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('el borrador', () => {
  it('se guarda y se lee tal cual', () => {
    guardarBorrador('reserva:1', { description: 'Fuga en la cocina' });

    expect(leerBorrador('reserva:1')).toEqual({
      description: 'Fuga en la cocina',
    });
  });

  it('cada pantalla tiene el suyo', () => {
    guardarBorrador('reserva:1', 'uno');

    expect(leerBorrador('reserva:2')).toBeNull();
  });

  it('olvidarlo lo borra', () => {
    guardarBorrador('perfil', { city: 'Málaga' });
    olvidarBorrador('perfil');

    expect(leerBorrador('perfil')).toBeNull();
  });

  it('sin almacenamiento, no falla: se pierde, como antes', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('lleno');
    });

    expect(() => guardarBorrador('perfil', {})).not.toThrow();
  });

  it('uno estropeado no rompe la pantalla', () => {
    sessionStorage.setItem('borrador:perfil', '{no es json');

    expect(leerBorrador('perfil')).toBeNull();
  });
});

describe('useBorrador', () => {
  it('recupera el de la pantalla y lo olvida, para que no vuelva a salir', () => {
    guardarBorrador('valoracion:b1', { rating: 4, comment: 'Muy bien' });

    const { result } = renderHook(() => useBorrador('valoracion:b1'));

    expect(result.current.recuperado).toEqual({
      rating: 4,
      comment: 'Muy bien',
    });
    expect(leerBorrador('valoracion:b1')).toBeNull();
  });

  it('sin borrador, nada', () => {
    const { result } = renderHook(() => useBorrador('valoracion:b1'));

    expect(result.current.recuperado).toBeNull();
  });

  it('guarda con su clave', () => {
    const { result } = renderHook(() => useBorrador<string>('mensaje:p1'));

    result.current.guardar('Hola');

    expect(leerBorrador('mensaje:p1')).toBe('Hola');
  });
});
