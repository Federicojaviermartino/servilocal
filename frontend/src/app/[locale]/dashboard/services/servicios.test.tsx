import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import es from '../../../../../messages/es.json';
import ServicesPage from './page';

const getMine = vi.fn();
const remove = vi.fn();
const create = vi.fn();
const update = vi.fn();
const toastError = vi.fn();
const toastExito = vi.fn();

vi.mock('@/lib/api', () => ({
  servicesApi: {
    getMine: () => getMine(),
    remove: (id: string) => remove(id),
    create: (datos: unknown) => create(datos),
    update: (id: string, datos: unknown) => update(id, datos),
  },
  categoriesApi: { getAll: vi.fn(async () => ({ data: [] })) },
}));

// El formulario tiene sus propias pruebas (ServiceForm.test.tsx). Aquí basta
// con lo que la página le pasa y con lo que hace con lo que devuelve.
vi.mock('@/components/organisms/ServiceForm', async () => {
  const React = await import('react');
  return {
    default: ({
      initial,
      onSubmit,
      onCancel,
    }: {
      initial?: { title?: string };
      onSubmit: (datos: Record<string, unknown>) => void;
      onCancel: () => void;
    }) =>
      React.createElement(
        'div',
        null,
        React.createElement('input', {
          'aria-label': 'Título',
          defaultValue: initial?.title ?? '',
        }),
        React.createElement(
          'button',
          { onClick: () => onSubmit({ title: 'Pintura de interiores' }) },
          'Enviar el formulario',
        ),
        React.createElement('button', { onClick: onCancel }, 'Cancelar'),
      ),
  };
});

vi.mock('@/lib/auth-store', () => ({
  useAuthStore: () => ({ user: { id: 'p1', role: 'provider' } }),
  // Los borradores se guardan con quien entró: ver borrador.ts.
  idRecordado: () => 'p1',
  PREFIJO_BORRADOR: 'borrador:',
}));

vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), {
    error: (m: string) => toastError(m),
    success: (m: string) => toastExito(m),
  }),
}));

const SERVICIO = {
  id: 's1',
  providerId: 'p1',
  title: 'Reparación de grifos',
  description: 'Cambio de grifos y arreglo de fugas.',
  priceMin: 40,
  priceMax: 90,
  priceUnit: 'por hora',
  city: 'Málaga',
  isActive: true,
  averageRating: 0,
  totalReviews: 0,
  createdAt: '2026-09-01T10:00:00.000Z',
};

function pintar() {
  render(
    <NextIntlClientProvider locale="es" messages={es as never}>
      <ServicesPage />
    </NextIntlClientProvider>,
  );
}

async function pintarYEliminar() {
  pintar();
  await screen.findByText(SERVICIO.title);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  await userEvent.click(
    screen.getByRole('button', { name: new RegExp(es.comun.eliminar, 'i') }),
  );
}

describe('Mis servicios', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMine.mockResolvedValue({ data: [SERVICIO] });
  });

  it('eliminar uno con reservas abiertas dice por qué no se puede', async () => {
    // Antes se borraba con sus reservas; ahora la API lo impide, y la
    // pantalla tiene que explicar qué hacer en vez de un «no se pudo».
    remove.mockRejectedValueOnce({
      response: { status: 409, data: { codigo: 'reservas-abiertas' } },
    });

    await pintarYEliminar();

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        es.erroresApi['reservas-abiertas'],
      ),
    );
  });

  it('un fallo sin código sigue con su mensaje de siempre', async () => {
    remove.mockRejectedValueOnce({ response: { status: 500, data: {} } });

    await pintarYEliminar();

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(es.serviciosPanel.errorEliminar),
    );
  });

  describe('con la sesión caducada al publicar', () => {
    afterEach(() => {
      sessionStorage.clear();
    });

    it('al volver, el formulario se abre con lo que se había escrito', async () => {
      sessionStorage.setItem(
        'borrador:p1:servicio',
        JSON.stringify({
          servicio: null,
          datos: { title: 'Pintura de interiores' },
        }),
      );
      getMine.mockResolvedValue({ data: [] });

      render(
        <NextIntlClientProvider locale="es" messages={es as never}>
          <ServicesPage />
        </NextIntlClientProvider>,
      );

      expect(
        await screen.findByDisplayValue('Pintura de interiores'),
      ).toBeInTheDocument();
      expect(screen.getByText(es.comun.borradorRecuperado)).toBeInTheDocument();
    });

    it('y si se editaba uno, vuelve a ese, con los cambios', async () => {
      sessionStorage.setItem(
        'borrador:p1:servicio',
        JSON.stringify({
          servicio: SERVICIO,
          datos: { title: 'Grifos y cisternas' },
        }),
      );
      getMine.mockResolvedValue({ data: [SERVICIO] });

      render(
        <NextIntlClientProvider locale="es" messages={es as never}>
          <ServicesPage />
        </NextIntlClientProvider>,
      );

      expect(
        await screen.findByDisplayValue('Grifos y cisternas'),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('heading', { name: es.serviciosPanel.editar }),
      ).toBeInTheDocument();
    });
  });

  describe('la lista', () => {
    it('sin servicios lo dice, en vez de quedarse en blanco', async () => {
      getMine.mockResolvedValue({ data: [] });

      pintar();

      expect(
        await screen.findByText(es.serviciosPanel.sinServicios),
      ).toBeVisible();
    });

    it('cada servicio enlaza a su ficha, y a sus valoraciones si las tiene', async () => {
      getMine.mockResolvedValue({
        data: [{ ...SERVICIO, totalReviews: 3, averageRating: 4.5 }],
      });

      pintar();

      expect(
        await screen.findByRole('link', { name: SERVICIO.title }),
      ).toHaveAttribute('href', '/services/s1');
      expect(
        screen.getByRole('link', { name: es.serviciosPanel.verValoraciones }),
      ).toHaveAttribute('href', '/services/s1#valoraciones');
      expect(screen.getByText(/3 valoraciones · 4,5/)).toBeVisible();
    });

    it('sin valoraciones no ofrece ir a responderlas', async () => {
      pintar();

      await screen.findByText(SERVICIO.title);
      expect(
        screen.queryByRole('link', {
          name: es.serviciosPanel.verValoraciones,
        }),
      ).toBeNull();
    });
  });

  describe('eliminar', () => {
    it('borra, lo dice y vuelve a pedir la lista', async () => {
      remove.mockResolvedValueOnce({});

      await pintarYEliminar();

      expect(remove).toHaveBeenCalledWith('s1');
      await waitFor(() =>
        expect(toastExito).toHaveBeenCalledWith(es.serviciosPanel.eliminado),
      );
      expect(getMine).toHaveBeenCalledTimes(2);
    });

    it('si no se confirma, no se toca nada', async () => {
      pintar();
      await screen.findByText(SERVICIO.title);
      vi.spyOn(window, 'confirm').mockReturnValue(false);

      await userEvent.click(
        screen.getByRole('button', {
          name: es.serviciosPanel.eliminarServicio.replace(
            '{nombre}',
            SERVICIO.title,
          ),
        }),
      );

      expect(remove).not.toHaveBeenCalled();
    });
  });

  describe('publicar uno nuevo', () => {
    afterEach(() => {
      sessionStorage.clear();
    });

    const abrir = async () => {
      pintar();
      await screen.findByText(SERVICIO.title);
      await userEvent.click(
        screen.getByRole('button', { name: es.serviciosPanel.nuevo }),
      );
      expect(
        screen.getByRole('heading', { name: es.serviciosPanel.nuevo }),
      ).toBeVisible();
    };

    it('lo crea, lo dice y vuelve a la lista actualizada', async () => {
      create.mockResolvedValueOnce({ data: {} });
      await abrir();

      await userEvent.click(
        screen.getByRole('button', { name: 'Enviar el formulario' }),
      );

      expect(create).toHaveBeenCalledWith({ title: 'Pintura de interiores' });
      await waitFor(() =>
        expect(toastExito).toHaveBeenCalledWith(es.serviciosPanel.creado),
      );
      expect(
        await screen.findByRole('heading', { name: es.serviciosPanel.titulo }),
      ).toBeVisible();
      expect(getMine).toHaveBeenCalledTimes(2);
    });

    it('si falla, lo dice y deja el formulario abierto', async () => {
      create.mockRejectedValueOnce({ response: { status: 500, data: {} } });
      await abrir();

      await userEvent.click(
        screen.getByRole('button', { name: 'Enviar el formulario' }),
      );

      await waitFor(() =>
        expect(toastError).toHaveBeenCalledWith(es.serviciosPanel.errorCrear),
      );
      expect(
        screen.getByRole('heading', { name: es.serviciosPanel.nuevo }),
      ).toBeVisible();
    });

    it('con la sesión caducada, guarda lo escrito para cuando vuelva', async () => {
      create.mockRejectedValueOnce({ response: { status: 401, data: {} } });
      await abrir();

      await userEvent.click(
        screen.getByRole('button', { name: 'Enviar el formulario' }),
      );

      await waitFor(() =>
        expect(
          JSON.parse(sessionStorage.getItem('borrador:p1:servicio') ?? 'null'),
        ).toEqual({
          servicio: null,
          datos: { title: 'Pintura de interiores' },
        }),
      );
    });

    it('cancelar vuelve a la lista sin crear nada', async () => {
      await abrir();

      await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

      expect(
        screen.getByRole('heading', { name: es.serviciosPanel.titulo }),
      ).toBeVisible();
      expect(create).not.toHaveBeenCalled();
    });
  });

  describe('editar', () => {
    const abrir = async () => {
      pintar();
      await screen.findByText(SERVICIO.title);
      await userEvent.click(
        screen.getByRole('button', {
          name: es.serviciosPanel.editarServicio.replace(
            '{nombre}',
            SERVICIO.title,
          ),
        }),
      );
    };

    it('abre el formulario con el servicio y guarda los cambios en ese', async () => {
      update.mockResolvedValueOnce({ data: {} });
      await abrir();

      expect(screen.getByDisplayValue(SERVICIO.title)).toBeVisible();
      await userEvent.click(
        screen.getByRole('button', { name: 'Enviar el formulario' }),
      );

      expect(update).toHaveBeenCalledWith('s1', {
        title: 'Pintura de interiores',
      });
      await waitFor(() =>
        expect(toastExito).toHaveBeenCalledWith(es.serviciosPanel.actualizado),
      );
    });

    it('si falla, lo dice y sigue editando', async () => {
      update.mockRejectedValueOnce({ response: { status: 500, data: {} } });
      await abrir();

      await userEvent.click(
        screen.getByRole('button', { name: 'Enviar el formulario' }),
      );

      await waitFor(() =>
        expect(toastError).toHaveBeenCalledWith(
          es.serviciosPanel.errorActualizar,
        ),
      );
      expect(
        screen.getByRole('heading', { name: es.serviciosPanel.editar }),
      ).toBeVisible();
    });

    it('cancelar vuelve a la lista', async () => {
      await abrir();

      await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

      expect(
        screen.getByRole('heading', { name: es.serviciosPanel.titulo }),
      ).toBeVisible();
      expect(update).not.toHaveBeenCalled();
    });
  });
});
