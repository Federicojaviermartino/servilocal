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

/**
 * Enviar saltándose la validación del navegador.
 *
 * Los campos declaran `required`, `min` y `max`, así que pulsar el botón con
 * algo fuera de rango no llega nunca a la comprobación en JS: corta antes el
 * navegador. Eso deja sin mirar la segunda red, que es la que escribe el
 * mensaje que se lee al lado del campo y la que sigue ahí si alguien quita
 * los atributos desde el inspector. Disparar el evento a mano es la forma de
 * llegar a ella.
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
      screen.getByText(es.reserva.precioMinimo.replace('{min}', '40')),
    ).toBeInTheDocument();
  });

  it('y por encima del máximo', async () => {
    const alEnviar = pintar();
    const precio = screen.getByLabelText(/Precio acordado/);

    await userEvent.clear(precio);
    await userEvent.type(precio, '900');
    await describir('Gotea el grifo de la cocina desde ayer.');
    enviarSaltandoAlNavegador();

    expect(alEnviar).not.toHaveBeenCalled();
    expect(
      screen.getByText(es.reserva.precioMaximo.replace('{max}', '90')),
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
    // impide de raíz si se le dice el mínimo.
    pintar();

    const manana = new Date();
    manana.setDate(manana.getDate() + 1);

    expect(screen.getByLabelText(es.reserva.fecha)).toHaveAttribute(
      'min',
      manana.toISOString().split('T')[0],
    );
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
      screen.getByText(es.reserva.resumenTotal.replace('{precio}', '65')),
    ).toBeInTheDocument();
  });
});
