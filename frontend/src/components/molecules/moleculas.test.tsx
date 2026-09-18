import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import es from '../../../messages/es.json';
import BookingCard from './BookingCard';
import SearchBar from './SearchBar';
import SelectorTema, { CLAVE_TEMA } from './SelectorTema';
import ServiceCardSkeleton from './ServiceCardSkeleton';
import type { Booking } from '@/types';

const pintar = (nodo: React.ReactNode, locale = 'es') =>
  render(
    <NextIntlClientProvider locale={locale} messages={es as never}>
      {nodo}
    </NextIntlClientProvider>,
  );

describe('SearchBar', () => {
  it('el campo tiene nombre accesible aunque no se vea etiqueta', () => {
    // El diseño no lleva etiqueta visible; sin aria-label el campo sería
    // «cuadro de búsqueda» sin más para quien escucha la página.
    pintar(<SearchBar onSearch={vi.fn()} />);

    expect(screen.getByLabelText(es.buscador.buscarServicios)).toBeInTheDocument();
  });

  it('buscar entrega el texto sin espacios de sobra', async () => {
    // Los espacios llegan solos al pegar desde otro sitio, y el servidor
    // buscaría literalmente « fontanero ».
    const alBuscar = vi.fn();
    pintar(<SearchBar onSearch={alBuscar} />);

    await userEvent.type(
      screen.getByLabelText(es.buscador.buscarServicios),
      '  fontanero  ',
    );
    await userEvent.click(screen.getByRole('button', { name: es.comun.buscar }));

    expect(alBuscar).toHaveBeenCalledWith('fontanero');
  });

  it('parte del texto que se le dé', () => {
    // Al volver a la búsqueda desde un resultado, el campo tiene que seguir
    // diciendo lo que se buscó.
    pintar(<SearchBar onSearch={vi.fn()} initialValue="cerrajero" />);

    expect(screen.getByLabelText(es.buscador.buscarServicios)).toHaveValue(
      'cerrajero',
    );
  });

  it('buscar en vacío también se permite', async () => {
    // Es la forma de quitar el filtro de texto y ver todo lo demás.
    const alBuscar = vi.fn();
    pintar(<SearchBar onSearch={alBuscar} />);

    await userEvent.click(screen.getByRole('button', { name: es.comun.buscar }));

    expect(alBuscar).toHaveBeenCalledWith('');
  });
});

describe('SelectorTema', () => {
  beforeEach(() => {
    document.documentElement.classList.remove('dark');
    localStorage.clear();
  });

  afterEach(() => {
    document.documentElement.classList.remove('dark');
  });

  it('en claro ofrece pasar a oscuro', () => {
    pintar(<SelectorTema />);

    expect(
      screen.getByRole('button', { name: es.tema.activarOscuro }),
    ).toBeInTheDocument();
  });

  it('arranca leyendo el tema que ya puso el script del layout', () => {
    // Quien lo aplica primero es el script en línea, antes del primer
    // pintado; este componente solo tiene que coincidir con él.
    document.documentElement.classList.add('dark');

    pintar(<SelectorTema />);

    expect(
      screen.getByRole('button', { name: es.tema.activarClaro }),
    ).toBeInTheDocument();
  });

  it('al alternar cambia la clase de la página y lo recuerda', async () => {
    pintar(<SelectorTema />);

    await userEvent.click(
      screen.getByRole('button', { name: es.tema.activarOscuro }),
    );

    expect(document.documentElement).toHaveClass('dark');
    expect(localStorage.getItem(CLAVE_TEMA)).toBe('oscuro');
  });

  it('si no se puede guardar, el tema se aplica igual', async () => {
    // Navegación privada o almacenamiento bloqueado: perder la preferencia
    // es aceptable, dejar la página a medio pintar no.
    const guardar = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('almacenamiento bloqueado');
      });
    pintar(<SelectorTema />);

    await userEvent.click(
      screen.getByRole('button', { name: es.tema.activarOscuro }),
    );

    expect(document.documentElement).toHaveClass('dark');
    guardar.mockRestore();
  });
});

describe('BookingCard', () => {
  const RESERVA = {
    id: 'a1b2c3d4-5566-7788-99aa-bbccddeeff00',
    status: 'confirmed',
    scheduledDate: '2026-04-15T10:30:00Z',
    totalPrice: 45,
    service: { title: 'Reparación de grifo', city: 'Málaga' },
    client: { firstName: 'Carlos', lastName: 'Ruiz' },
    provider: { firstName: 'Laura', lastName: 'Gil' },
  } as unknown as Booking;

  it('el cliente ve al profesional', () => {
    pintar(<BookingCard booking={RESERVA} viewAs="client" />);

    expect(screen.getByText('Laura Gil')).toBeInTheDocument();
    expect(screen.queryByText('Carlos Ruiz')).not.toBeInTheDocument();
  });

  it('el profesional ve al cliente', () => {
    // La misma tarjeta desde los dos lados: enseñar siempre al proveedor
    // dejaría al profesional mirando su propio nombre.
    pintar(<BookingCard booking={RESERVA} viewAs="provider" />);

    expect(screen.getByText('Carlos Ruiz')).toBeInTheDocument();
  });

  it('el estado sale traducido, no en clave', () => {
    pintar(<BookingCard booking={RESERVA} viewAs="client" />);

    expect(screen.getByText(es.estados.confirmada)).toBeInTheDocument();
  });

  it('del identificador solo se enseña el principio', () => {
    // Un UUID entero no cabe y no dice nada; los ocho primeros bastan para
    // referirse a una reserva por teléfono.
    pintar(<BookingCard booking={RESERVA} viewAs="client" />);

    expect(screen.getByText('#a1b2c3d4')).toBeInTheDocument();
  });

  it('sin ciudad no se pinta el sitio vacío', () => {
    const sinCiudad = {
      ...RESERVA,
      service: { title: 'Reparación de grifo', city: '' },
    } as unknown as Booking;

    pintar(<BookingCard booking={sinCiudad} viewAs="client" />);

    expect(screen.queryByText('Málaga')).not.toBeInTheDocument();
  });

  it('lleva al detalle de esa reserva', () => {
    pintar(<BookingCard booking={RESERVA} viewAs="client" />);

    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      `/dashboard/bookings/${RESERVA.id}`,
    );
  });
});

describe('ServiceCardSkeleton', () => {
  it('no anuncia nada a quien escucha la página', () => {
    // Es una silueta provisional: leerla en voz alta sería ruido.
    const { container } = render(<ServiceCardSkeleton />);

    const bloques = container.querySelectorAll('[aria-hidden="true"]');
    expect(bloques.length).toBeGreaterThan(4);
    expect(container.textContent).toBe('');
  });
});
