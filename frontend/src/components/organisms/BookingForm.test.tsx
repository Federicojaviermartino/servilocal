import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import es from '../../../messages/es.json';
import BookingForm from './BookingForm';
import type { Service } from '@/types';

/**
 * Lo que el formulario deja pasar y lo que no.
 *
 * Es el último sitio donde se puede evitar una reserva imposible antes de que
 * llegue al servidor. El servidor la rechazaría igual —el importe se valida
 * contra la tarifa publicada desde que se cerró aquel agujero— pero enterarse
 * aquí es la diferencia entre un aviso al lado del campo y un error después
 * de pulsar.
 */
const SERVICIO = {
  id: 's1',
  title: 'Reparación de grifo',
  priceMin: 40,
  priceMax: 90,
} as unknown as Service;

function pintar(servicio: Service = SERVICIO) {
  const alEnviar = vi.fn();
  render(
    <NextIntlClientProvider locale="es" messages={es as never}>
      <BookingForm service={servicio} onSubmit={alEnviar} />
    </NextIntlClientProvider>,
  );
  return alEnviar;
}

const enviar = () =>
  userEvent.click(screen.getByRole('button', { name: es.reserva.continuar }));

/** Un día contado desde hoy, en la fecha local, como la pide el campo. */
function diaLocal(dentroDe: number): string {
  const dia = new Date();
  dia.setDate(dia.getDate() + dentroDe);
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${dia.getFullYear()}-${dos(dia.getMonth() + 1)}-${dos(dia.getDate())}`;
}

/**
 * Enviar el formulario sin pulsar el botón.
 *
 * El formulario va con noValidate: la comprobación es la de aquí, con los
 * mensajes en el idioma de la página. Antes cortaba primero el navegador,
 * en el suyo, y el aviso junto al campo no llegaba a salir.
 */
const enviarSaltandoAlNavegador = () =>
  fireEvent.submit(
    screen.getByRole('button', { name: es.reserva.continuar }).closest('form')!,
  );

const describir = (texto: string) =>
  userEvent.type(
    screen.getByPlaceholderText(es.reserva.descripcionPlaceholder),
    texto,
  );

describe('BookingForm', () => {
  it('no envía sin una descripción del trabajo', async () => {
    // Un profesional que recibe «necesito algo» no puede prepararse ni
    // decidir si acepta.
    const alEnviar = pintar();

    await enviar();

    expect(alEnviar).not.toHaveBeenCalled();
  });

  it('y tampoco si se salta la validación del navegador', async () => {
    const alEnviar = pintar();

    enviarSaltandoAlNavegador();

    expect(alEnviar).not.toHaveBeenCalled();
    expect(screen.getByText(es.reserva.descripcionCorta)).toBeInTheDocument();
  });

  it('con una descripción demasiado corta, el aviso propio sí aparece', async () => {
    // Aquí el navegador da el campo por bueno —tiene contenido— y el turno
    // pasa a la comprobación propia, que es la que sabe cuánto es poco.
    const alEnviar = pintar();

    await describir('grifo');
    await enviar();

    expect(alEnviar).not.toHaveBeenCalled();
    expect(screen.getByText(es.reserva.descripcionCorta)).toBeInTheDocument();
  });

  it('con todo relleno, envía', async () => {
    const alEnviar = pintar();

    await describir('Gotea el grifo de la cocina desde ayer.');
    await enviar();

    expect(alEnviar).toHaveBeenCalledTimes(1);
  });

  it('el campo de precio declara el rango publicado', async () => {
    // Es la primera red y la que evita el viaje: el navegador no deja ni
    // enviar. Sin estos atributos, todo lo de abajo seguiría pasando.
    pintar();
    const precio = screen.getByLabelText(/Precio acordado/);

    expect(precio).toHaveAttribute('min', '40');
    expect(precio).toHaveAttribute('max', '90');
  });

  it('rechaza un importe por debajo del mínimo publicado', async () => {
    // El servidor también lo rechaza —el importe se valida contra la tarifa
    // publicada— pero decirlo aquí evita el viaje.
    const alEnviar = pintar();
    const precio = screen.getByLabelText(/Precio acordado/);

    await userEvent.clear(precio);
    await userEvent.type(precio, '5');
    await describir('Gotea el grifo de la cocina desde ayer.');
    enviarSaltandoAlNavegador();

    expect(alEnviar).not.toHaveBeenCalled();
    expect(
      screen.getByText(es.reserva.precioMinimo.replace('{min}', '40\ €')),
    ).toBeInTheDocument();
  });

  it('y por encima del máximo', async () => {
    const alEnviar = pintar();
    const precio = screen.getByLabelText(/Precio acordado/);

    await userEvent.clear(precio);
    // De una vez: tecleado cifra a cifra, con la máquina cargada, llegó a
    // enviarse con 90.
    await userEvent.click(precio);
    await userEvent.paste('900');
    await describir('Gotea el grifo de la cocina desde ayer.');
    enviarSaltandoAlNavegador();

    expect(alEnviar).not.toHaveBeenCalled();
    expect(
      screen.getByText(es.reserva.precioMaximo.replace('{max}', '90\ €')),
    ).toBeInTheDocument();
  });

  it('si la horquilla está al revés, el máximo no manda', async () => {
    // Hubo servicios publicables con el máximo por debajo del mínimo. Aplicar
    // ese máximo dejaba la reserva sin ningún importe posible: por debajo
    // fallaba el mínimo y por encima el máximo, así que no había forma de
    // contratar. Ahora ya no se puede publicar así, pero los que quedaran
    // tienen que seguir funcionando, y el servidor hace lo mismo.
    const alEnviar = pintar({
      ...SERVICIO,
      priceMin: 90,
      priceMax: 40,
    } as unknown as Service);

    await describir('Gotea el grifo de la cocina desde ayer.');
    enviarSaltandoAlNavegador();

    expect(alEnviar).toHaveBeenCalledWith(
      expect.objectContaining({ totalPrice: 90 }),
    );
  });

  it('con un precio fijo, el máximo igual al mínimo sí manda', async () => {
    // Se comparaba con «>», y un servicio de 50 euros se podía reservar por
    // cualquier cifra por encima.
    const alEnviar = pintar({
      ...SERVICIO,
      priceMin: 50,
      priceMax: 50,
    } as unknown as Service);
    const precio = screen.getByLabelText(/Precio acordado/);

    await userEvent.clear(precio);
    await userEvent.click(precio);
    await userEvent.paste('60');
    await describir('Gotea el grifo de la cocina desde ayer.');
    enviarSaltandoAlNavegador();

    expect(alEnviar).not.toHaveBeenCalled();
    expect(
      screen.getByText(es.reserva.precioMaximo.replace('{max}', '50\ €')),
    ).toBeInTheDocument();
  });

  it('sin máximo publicado, por arriba no hay tope', async () => {
    // Pagar de más es decisión de quien paga, y el servidor opina igual.
    const alEnviar = pintar({
      ...SERVICIO,
      priceMax: undefined,
    } as unknown as Service);
    const precio = screen.getByLabelText(/Precio acordado/);

    await userEvent.clear(precio);
    await userEvent.type(precio, '500');
    await describir('Gotea el grifo de la cocina desde ayer.');
    enviarSaltandoAlNavegador();

    expect(alEnviar).toHaveBeenCalledTimes(1);
  });

  it('envía la fecha y la hora juntas, en formato ISO', async () => {
    // El servidor espera un instante, no una fecha y una hora sueltas.
    const alEnviar = pintar();

    await describir('Gotea el grifo de la cocina desde ayer.');
    await enviar();

    const enviado = alEnviar.mock.calls[0][0] as { scheduledDate: string };
    expect(enviado.scheduledDate).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(new Date(enviado.scheduledDate).getTime()).toBeGreaterThan(
      Date.now(),
    );
  });

  it('no deja elegir una fecha anterior a mañana', async () => {
    // Reservar para ayer no significa nada, y el calendario del navegador lo
    // impide de raíz si se le dice el mínimo. En la fecha local: con la UTC,
    // pasada la medianoche en España, «mañana» salía hoy.
    pintar();

    expect(screen.getByLabelText(es.reserva.fecha)).toHaveAttribute(
      'min',
      diaLocal(1),
    );
  });

  it('ni una a más de un año vista, que la API no admite', async () => {
    pintar();

    expect(screen.getByLabelText(es.reserva.fecha)).toHaveAttribute(
      'max',
      diaLocal(365),
    );
  });

  it('una fecha fuera de ese margen escrita a mano se avisa al lado', async () => {
    const alEnviar = pintar();
    fireEvent.change(screen.getByLabelText(es.reserva.fecha), {
      target: { value: diaLocal(-1) },
    });
    await describir('Gotea el grifo de la cocina desde ayer.');

    enviarSaltandoAlNavegador();

    expect(screen.getByText(es.reserva.fechaFueraDeRango)).toBeInTheDocument();
    expect(alEnviar).not.toHaveBeenCalled();
  });

  it('el resumen dice cuánto ocupa la reserva', async () => {
    pintar({ ...SERVICIO, durationMinutes: 90 } as Service);

    expect(screen.getByText('Duración: 1,5 h')).toBeInTheDocument();
  });

  it('y un servicio que no lo dice ocupa una hora, como en la base', async () => {
    pintar();

    expect(screen.getByText('Duración: 1 h')).toBeInTheDocument();
  });

  it('el importe que viaja es el que se eligió', async () => {
    const alEnviar = pintar();
    const precio = screen.getByLabelText(/Precio acordado/);

    await userEvent.clear(precio);
    await userEvent.type(precio, '65');
    await describir('Gotea el grifo de la cocina desde ayer.');
    await enviar();

    expect(alEnviar).toHaveBeenCalledWith(
      expect.objectContaining({ totalPrice: 65 }),
    );
  });

  it('el resumen refleja lo que se va a enviar', async () => {
    // Es lo último que se lee antes de comprometerse.
    pintar();
    const precio = screen.getByLabelText(/Precio acordado/);

    await userEvent.clear(precio);
    await userEvent.type(precio, '65');

    expect(
      screen.getByText(es.reserva.resumenTotal.replace('{precio}', '65\ €')),
    ).toBeInTheDocument();
  });

  it('con un borrador, nace con lo que se estaba escribiendo', () => {
    // Si la sesión caducó al enviar, al volver se recupera lo escrito.
    const fecha = new Date(`${diaLocal(3)}T16:45:00`).toISOString();
    render(
      <NextIntlClientProvider locale="es" messages={es as never}>
        <BookingForm
          service={SERVICIO}
          onSubmit={vi.fn()}
          inicial={{
            scheduledDate: fecha,
            description: 'Gotea el grifo del baño',
            totalPrice: 55,
          }}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByLabelText(es.reserva.fecha)).toHaveValue(diaLocal(3));
    expect(screen.getByLabelText(es.reserva.hora)).toHaveValue('16:45');
    expect(screen.getByLabelText(es.reserva.descripcionTrabajo)).toHaveValue(
      'Gotea el grifo del baño',
    );
    expect(screen.getByRole('spinbutton')).toHaveValue(55);
  });

  it('la validación es la de la página, no la del navegador', () => {
    pintar();

    expect(
      screen
        .getByRole('button', { name: es.reserva.continuar })
        .closest('form'),
    ).toHaveAttribute('novalidate');
  });

  it('cualquier importe de la horquilla vale, con céntimos', async () => {
    // Con un paso de 5 contado desde el mínimo, 42 euros en un servicio
    // «desde 40» no se podía reservar.
    const alEnviar = pintar();
    const importe = screen.getByRole('spinbutton');
    await userEvent.clear(importe);
    await userEvent.type(importe, '42.5');
    await describir('Gotea el grifo del baño desde ayer');

    await enviar();

    expect(alEnviar).toHaveBeenCalledWith(
      expect.objectContaining({ totalPrice: 42.5 }),
    );
  });

  it('el resumen dice la fecha en el idioma de la página, no en crudo', () => {
    pintar();

    const manana = new Date(`${diaLocal(1)}T00:00:00`).toLocaleDateString(
      'es',
      { day: 'numeric', month: 'long', year: 'numeric' },
    );
    expect(screen.getByText(new RegExp(manana))).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(diaLocal(1)))).toBeNull();
  });

  it('el error de la descripción está asociado al campo', async () => {
    pintar();

    enviarSaltandoAlNavegador();

    expect(
      screen.getByLabelText(es.reserva.descripcionTrabajo),
    ).toHaveAccessibleDescription(es.reserva.descripcionCorta);
  });
});
