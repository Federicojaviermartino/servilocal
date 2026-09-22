import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import es from '../../../messages/es.json';
import EstadoCarga from './EstadoCarga';

vi.mock('@/i18n/navigation', async () => {
  const React = await import('react');
  return {
    Link: ({ href, children }: { href: string; children: React.ReactNode }) =>
      React.createElement('a', { href }, children),
  };
});

function pintar(
  estado: 'cargando' | 'listo' | 'error' | 'sesion',
  onReintentar?: () => void,
) {
  render(
    <NextIntlClientProvider locale="es" messages={es as never}>
      <EstadoCarga estado={estado} onReintentar={onReintentar}>
        <p>tus reservas</p>
      </EstadoCarga>
    </NextIntlClientProvider>,
  );
}

describe('EstadoCarga', () => {
  it('con los datos listos deja pasar el contenido', () => {
    pintar('listo');

    expect(screen.getByText('tus reservas')).toBeInTheDocument();
  });

  it('mientras carga no enseña el contenido a medias', () => {
    pintar('cargando');

    expect(screen.queryByText('tus reservas')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('un fallo se cuenta y se puede reintentar', () => {
    // Esto es lo que antes se veía como «no tienes nada».
    pintar('error', vi.fn());

    expect(screen.getByRole('alert')).toHaveTextContent(es.carga.error);
    expect(
      screen.getByRole('button', { name: new RegExp(es.carga.reintentar) }),
    ).toBeInTheDocument();
    expect(screen.queryByText('tus reservas')).not.toBeInTheDocument();
  });

  it('reintentar vuelve a pedirlo', async () => {
    const reintentar = vi.fn();
    pintar('error', reintentar);

    await userEvent.click(
      screen.getByRole('button', { name: new RegExp(es.carga.reintentar) }),
    );

    expect(reintentar).toHaveBeenCalledTimes(1);
  });

  it('sin manera de reintentar, no se ofrece un botón que no hace nada', () => {
    pintar('error');

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('una sesión caducada lleva a entrar, no a reintentar', () => {
    // El token dura un día: es el fallo más frecuente, y reintentar con la
    // misma credencial caducada no arregla nada.
    pintar('sesion', vi.fn());

    expect(screen.getByText(es.carga.sesionCaducada)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: es.carga.entrarDeNuevo }),
    ).toHaveAttribute('href', '/auth/login');
    expect(
      screen.queryByRole('button', { name: new RegExp(es.carga.reintentar) }),
    ).not.toBeInTheDocument();
  });

  it('el fallo y la sesión caducada no se confunden', () => {
    // Son dos remedios distintos: uno se reintenta y el otro se vuelve a
    // entrar. Enseñar el mismo cartel para los dos deja a la persona
    // pulsando un botón que nunca va a funcionar.
    pintar('sesion');

    expect(screen.queryByText(es.carga.error)).not.toBeInTheDocument();
  });
});
