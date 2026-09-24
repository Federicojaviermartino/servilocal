import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import es from '../../../messages/es.json';
import ServiceForm from './ServiceForm';
import type { Service } from '@/types';

/**
 * El formulario con el que un profesional publica lo que hace.
 *
 * Lo que sale de aquí es la tarifa contra la que luego se valida cada
 * reserva, en el navegador y en el servidor. Un servicio mal publicado no da
 * un error: da una ficha que se ve normal y que nadie puede contratar.
 */
const CATEGORIAS = [
  { id: 'c1', name: 'Fontanería', slug: 'fontaneria' },
  { id: 'c2', name: 'Electricidad', slug: 'electricidad' },
];

const obtenerCategorias = vi.fn(async () => ({ data: CATEGORIAS }));

vi.mock('@/lib/api', () => ({
  categoriesApi: { getAll: () => obtenerCategorias() },
}));

function pintar(inicial?: Partial<Service>) {
  const alEnviar = vi.fn();
  const alCancelar = vi.fn();
  render(
    <NextIntlClientProvider locale="es" messages={es as never}>
      <ServiceForm
        initial={inicial}
        onSubmit={alEnviar}
        onCancel={alCancelar}
      />
    </NextIntlClientProvider>,
  );
  return { alEnviar, alCancelar };
}

const COMPLETO: Partial<Service> = {
  title: 'Reparación de grifos',
  description: 'Cambio de grifos y arreglo de fugas en cocina y baño.',
  categoryId: 'c1',
  priceMin: 40,
  priceMax: 90,
  address: 'Calle Larios 1',
  city: 'Málaga',
};

/**
 * Enviar saltándose la validación del navegador, que es anterior y corta
 * antes de que llegue el turno de la comprobación propia. Aquí hace falta
 * porque lo que se comprueba —que el máximo no quede por debajo del mínimo—
 * no se puede expresar con un atributo: depende de otro campo.
 */
const enviarSaltandoAlNavegador = () =>
  fireEvent.submit(
    screen
      .getByRole('button', { name: es.formularioServicio.crearServicio })
      .closest('form')!,
  );

describe('ServiceForm', () => {
  beforeEach(() => {
    obtenerCategorias.mockClear();
    obtenerCategorias.mockResolvedValue({ data: CATEGORIAS });
  });

  it('carga las categorías para poder elegir una', async () => {
    pintar();

    await waitFor(() =>
      expect(
        screen.getByRole('option', { name: 'Fontanería' }),
      ).toBeInTheDocument(),
    );
  });

  it('si las categorías no cargan, el formulario sigue en pie', async () => {
    // Publicar no puede depender de que una llamada auxiliar responda: el
    // resto de lo escrito se perdería.
    obtenerCategorias.mockRejectedValue(new Error('sin red'));
    pintar();

    await waitFor(() =>
      expect(
        screen.getByRole('option', {
          name: es.formularioServicio.seleccionaCategoria,
        }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole('option', { name: 'Fontanería' }),
    ).not.toBeInTheDocument();
  });

  it('no publica un máximo por debajo del mínimo', async () => {
    // Era publicable y dejaba el servicio sin ningún importe válido: por
    // debajo falla el mínimo y por encima el máximo, así que el cliente no
    // podía reservar de ninguna manera y la ficha no lo delataba.
    const { alEnviar } = pintar({ ...COMPLETO, priceMin: 90, priceMax: 40 });

    enviarSaltandoAlNavegador();

    expect(alEnviar).not.toHaveBeenCalled();
    expect(
      screen.getByText(es.formularioServicio.rangoInvertido),
    ).toBeInTheDocument();
  });

  it('con la horquilla en orden, publica', async () => {
    const { alEnviar } = pintar(COMPLETO);

    enviarSaltandoAlNavegador();

    expect(alEnviar).toHaveBeenCalledWith(
      expect.objectContaining({ priceMin: 40, priceMax: 90 }),
    );
  });

  it('sin máximo, publica sin máximo en vez de con cero', async () => {
    // Un cero sería una horquilla de 40 a 0, que es el caso de arriba con
    // otro nombre. Lo que espera el servidor es que no venga el campo.
    const { alEnviar } = pintar({ ...COMPLETO, priceMax: undefined });

    enviarSaltandoAlNavegador();

    expect(alEnviar).toHaveBeenCalledWith(
      expect.objectContaining({ priceMax: undefined }),
    );
  });

  it('el aviso desaparece al corregir la horquilla', async () => {
    // Un mensaje que se queda después de arreglarlo hace dudar de si se
    // arregló.
    const { alEnviar } = pintar({ ...COMPLETO, priceMin: 90, priceMax: 40 });

    enviarSaltandoAlNavegador();
    expect(
      screen.getByText(es.formularioServicio.rangoInvertido),
    ).toBeInTheDocument();

    const maximo = screen.getByLabelText(es.formularioServicio.precioMaximo);
    await userEvent.clear(maximo);
    await userEvent.type(maximo, '150');
    enviarSaltandoAlNavegador();

    expect(alEnviar).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByText(es.formularioServicio.rangoInvertido),
    ).not.toBeInTheDocument();
  });

  it('al editar, conserva una ciudad que ya no está en la lista', async () => {
    // Si desapareciera de las opciones, el desplegable se quedaría vacío y
    // el siguiente guardado borraría la ciudad sin avisar.
    pintar({ ...COMPLETO, city: 'Villanueva del Trabuco' });

    expect(
      screen.getByRole('option', { name: 'Villanueva del Trabuco' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(es.comun.ciudad)).toHaveValue(
      'Villanueva del Trabuco',
    );
  });

  it('el radio de cobertura no admite cualquier número', async () => {
    pintar(COMPLETO);
    const radio = screen.getByLabelText(es.formularioServicio.radio);

    expect(radio).toHaveAttribute('min', '1');
    expect(radio).toHaveAttribute('max', '100');
  });

  it('cancelar no envía nada', async () => {
    const { alEnviar, alCancelar } = pintar(COMPLETO);

    await userEvent.click(
      screen.getByRole('button', { name: es.comun.cancelar }),
    );

    expect(alCancelar).toHaveBeenCalledTimes(1);
    expect(alEnviar).not.toHaveBeenCalled();
  });

  it('al editar, el botón dice guardar y no crear', async () => {
    pintar({ ...COMPLETO, id: 's1' });

    expect(
      screen.getByRole('button', {
        name: es.formularioServicio.guardarCambios,
      }),
    ).toBeInTheDocument();
  });
});
