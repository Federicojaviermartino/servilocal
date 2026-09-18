import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import es from '../../../messages/es.json';
import AsistenteBusqueda from './AsistenteBusqueda';

const RESPUESTA = {
  modo: 'ia' as const,
  criterios: {
    categoria: 'Fontanería',
    categoriaSlug: 'fontaneria',
    ciudad: 'Málaga',
    texto: 'grifo',
  },
  servicios: [],
  total: 0,
};

const asistente = vi.fn(async (_mensaje: string) => ({ data: RESPUESTA }));

vi.mock('@/lib/api', () => ({
  iaApi: { asistente: (m: string) => asistente(m) },
}));

const pintar = () =>
  render(
    <NextIntlClientProvider locale="es" messages={es as never}>
      <AsistenteBusqueda />
    </NextIntlClientProvider>,
  );

async function abrir() {
  pintar();
  await userEvent.click(
    screen.getByRole('button', { name: es.asistente.abrir }),
  );
}

describe('AsistenteBusqueda', () => {
  beforeEach(() => {
    asistente.mockClear();
  });

  it('empieza cerrado, como un botón flotante', () => {
    // Abierto de entrada taparía los resultados en un móvil.
    pintar();

    expect(
      screen.getByRole('button', { name: es.asistente.abrir }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('se abre al pulsarlo', async () => {
    await abrir();

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('no llama al modelo con el campo vacío', async () => {
    // Cada llamada cuesta dinero del tope mensual.
    await abrir();

    await userEvent.click(
      screen.getByRole('button', { name: es.asistente.enviar }),
    );

    expect(asistente).not.toHaveBeenCalled();
  });

  it('tampoco con solo espacios', async () => {
    await abrir();

    await userEvent.type(screen.getByRole('textbox'), '   ');
    await userEvent.click(
      screen.getByRole('button', { name: es.asistente.enviar }),
    );

    expect(asistente).not.toHaveBeenCalled();
  });

  it('manda el texto sin espacios de sobra y enseña la respuesta', async () => {
    await abrir();

    await userEvent.type(screen.getByRole('textbox'), '  se me ha roto el grifo  ');
    await userEvent.click(
      screen.getByRole('button', { name: es.asistente.enviar }),
    );

    expect(asistente).toHaveBeenCalledWith('se me ha roto el grifo');
    // La ciudad que interpretó el modelo se enseña: sin ella nadie sabe
    // sobre qué se ha buscado.
    expect(await screen.findByText('Málaga')).toBeInTheDocument();
  });

  it('si falla, se puede reintentar en lugar de quedarse colgado', async () => {
    // Da igual por qué falló: lo único que necesita saber quien pregunta es
    // que puede volver a intentarlo.
    asistente.mockRejectedValueOnce(new Error('tope alcanzado'));
    await abrir();

    await userEvent.type(screen.getByRole('textbox'), 'hola');
    await userEvent.click(
      screen.getByRole('button', { name: es.asistente.enviar }),
    );

    expect(await screen.findByText(es.asistente.error)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: es.asistente.enviar }),
    ).toBeEnabled();
  });

  it('se cierra y vuelve a ser un botón', async () => {
    await abrir();

    await userEvent.click(
      screen.getByRole('button', { name: es.asistente.cerrar }),
    );

    expect(
      screen.getByRole('button', { name: es.asistente.abrir }),
    ).toBeInTheDocument();
  });
});
