import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import es from '../../../messages/es.json';
import de from '../../../messages/de.json';
import ar from '../../../messages/ar.json';
import { SERVICIO_EJEMPLO, otroServicio } from '../../../.storybook/datos';
import ServiceCard from './ServiceCard';
import type { Service } from '@/types';

function pintar(servicio: Service, mensajes: unknown = es, locale = 'es') {
  return render(
    <NextIntlClientProvider locale={locale} messages={mensajes as never}>
      <ServiceCard service={servicio} />
    </NextIntlClientProvider>,
  );
}

describe('ServiceCard', () => {
  it('enseña un rango cuando hay precio máximo distinto', () => {
    pintar(otroServicio('rango', { priceMin: 40, priceMax: 90 }) as Service);

    // Con la moneda: la tarjeta decía «40 a 90 por hora», sin euros.
    expect(screen.getByText(/40\s€ a 90\s€/)).toBeInTheDocument();
  });

  it('enseña un solo precio cuando no hay máximo', () => {
    pintar(
      otroServicio('unico', {
        priceMin: 40,
        priceMax: undefined,
      }) as Service,
    );

    expect(screen.getByText(/^40 /)).toBeInTheDocument();
  });

  it('no enseña un rango cuando el máximo es igual al mínimo', () => {
    // «40 a 40» es ruido: se lee como si hubiera una horquilla que no existe.
    pintar(otroServicio('iguales', { priceMin: 40, priceMax: 40 }) as Service);

    expect(screen.queryByText(/40 a 40/)).not.toBeInTheDocument();
  });

  it('traduce la categoría y la unidad, no el título', () => {
    // El título lo escribe el profesional: es contenido y sigue como está.
    pintar(SERVICIO_EJEMPLO, de, 'de');

    expect(screen.getByText('Sanitärinstallation')).toBeInTheDocument();
    expect(
      screen.getByText(/pro Stunde|pro Auftrag|pro Tag/),
    ).toBeInTheDocument();
    expect(screen.getByText(SERVICIO_EJEMPLO.title)).toBeInTheDocument();
  });

  it('el título y la descripción toman su propia dirección', () => {
    // En árabe, un título en castellano se cortaba por el lado equivocado:
    // «…Desatasco de tuberías y» en vez de «Desatasco de tuberías y…».
    pintar(SERVICIO_EJEMPLO, ar, 'ar');

    expect(
      screen.getByRole('heading', { name: SERVICIO_EJEMPLO.title }),
    ).toHaveAttribute('dir', 'auto');
    expect(screen.getByText(SERVICIO_EJEMPLO.description)).toHaveAttribute(
      'dir',
      'auto',
    );
  });

  it('enlaza a la ficha del servicio', () => {
    pintar(SERVICIO_EJEMPLO);

    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      expect.stringContaining(SERVICIO_EJEMPLO.id),
    );
  });
});
