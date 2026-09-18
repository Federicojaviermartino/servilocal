import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import es from '../../../messages/es.json';
import { SERVICIO_EJEMPLO } from '../../../.storybook/datos';
import PanelAsistente, { type RespuestaAsistente } from './PanelAsistente';

const BASE = {
  mensaje: '',
  onMensajeChange: vi.fn(),
  onEnviar: vi.fn(),
  onCerrar: vi.fn(),
};

function pintar(props: Partial<React.ComponentProps<typeof PanelAsistente>>) {
  return render(
    <NextIntlClientProvider locale="es" messages={es as never}>
      <PanelAsistente {...BASE} {...props} />
    </NextIntlClientProvider>,
  );
}

const CON_RESULTADOS: RespuestaAsistente = {
  modo: 'ia',
  criterios: {
    categoria: 'Fontanería',
    categoriaSlug: 'fontaneria',
    ciudad: 'Madrid',
    texto: null,
  },
  servicios: [SERVICIO_EJEMPLO],
  total: 1,
};

describe('PanelAsistente', () => {
  it('no inventa nada antes de recibir respuesta', () => {
    pintar({});

    expect(screen.queryByText('Hemos buscado:')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('dice en qué ciudad ha buscado cuando la hay', () => {
    pintar({ respuesta: CON_RESULTADOS });

    expect(screen.getByRole('status')).toHaveTextContent('Madrid');
  });

  it('dice «en toda España» cuando el servidor soltó la ciudad', () => {
    // Mantener «Madrid» sobre resultados de todo el país sería mentir sobre
    // la búsqueda que se ha hecho.
    pintar({
      respuesta: {
        ...CON_RESULTADOS,
        criterios: { ...CON_RESULTADOS.criterios, ciudad: null },
      },
    });

    expect(screen.getByRole('status')).toHaveTextContent('en toda España');
    expect(screen.getByRole('status')).not.toHaveTextContent('Madrid');
  });

  it('avisa cuando ha respondido sin modelo', () => {
    pintar({ respuesta: { ...CON_RESULTADOS, modo: 'basico' } });

    expect(screen.getByRole('status')).toHaveTextContent(
      'Búsqueda sin asistente',
    );
  });

  it('no avisa de nada cuando sí hubo modelo', () => {
    pintar({ respuesta: CON_RESULTADOS });

    expect(screen.getByRole('status')).not.toHaveTextContent(
      'Búsqueda sin asistente',
    );
  });

  it('con cero resultados lo dice, en vez de dejar el hueco vacío', () => {
    pintar({ respuesta: { ...CON_RESULTADOS, servicios: [], total: 0 } });

    expect(screen.getByText(/No hemos encontrado nada/)).toBeInTheDocument();
  });

  it('el error no arrastra resultados viejos', () => {
    pintar({ error: true, respuesta: CON_RESULTADOS });

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
