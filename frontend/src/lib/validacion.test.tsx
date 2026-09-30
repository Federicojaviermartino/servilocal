import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { FormEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import es from '../../messages/es.json';
import { useValidacion, type MensajesPropios } from './validacion';

/** Un formulario con un campo de cada clase, y lo que dice cada uno. */
function Formulario({
  alEnviar,
  propios,
}: {
  alEnviar: () => void;
  propios?: MensajesPropios;
}) {
  const { errores, comprobar, alCambiar } = useValidacion();
  const enviar = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    if (comprobar(evento.currentTarget, propios)) alEnviar();
  };
  return (
    <form noValidate onSubmit={enviar} onChange={alCambiar}>
      <input aria-label="nombre" name="nombre" required defaultValue="" />
      <input aria-label="correo" name="correo" type="email" defaultValue="x" />
      <input
        aria-label="clave"
        name="clave"
        minLength={8}
        defaultValue="corta"
      />
      <input
        aria-label="importe"
        name="importe"
        type="number"
        min={0.5}
        defaultValue="0.2"
      />
      <input
        aria-label="fecha"
        name="fecha"
        type="date"
        min="2026-10-01"
        defaultValue="2026-09-01"
      />
      <button type="submit">enviar</button>
      <output data-testid="errores">{JSON.stringify(errores)}</output>
    </form>
  );
}

function pintar(propios?: MensajesPropios, antesDeEnviar?: () => void) {
  const alEnviar = vi.fn();
  render(
    <NextIntlClientProvider locale="es" messages={es as never}>
      <Formulario alEnviar={alEnviar} propios={propios} />
    </NextIntlClientProvider>,
  );
  antesDeEnviar?.();
  fireEvent.submit(screen.getByRole('button', { name: 'enviar' }));
  const errores = JSON.parse(
    screen.getByTestId('errores').textContent ?? '{}',
  ) as Record<string, string>;
  return { alEnviar, errores };
}

describe('useValidacion', () => {
  it('cada regla incumplida se explica en el idioma de la página', () => {
    const { alEnviar, errores } = pintar();

    expect(alEnviar).not.toHaveBeenCalled();
    expect(errores).toEqual({
      nombre: es.validacion.obligatorio,
      correo: es.validacion.correo,
      importe: 'El valor mínimo es 0,5.',
      fecha: 'La fecha no puede ser anterior al 1 de octubre de 2026.',
    });
  });

  it('lo que se queda corto dice cuánto le falta', () => {
    // jsdom no lo implementa: el navegador solo lo marca cuando alguien ha
    // escrito, y aquí se le dice cómo está el campo.
    const { errores } = pintar(undefined, () =>
      Object.defineProperty(screen.getByLabelText('clave'), 'validity', {
        value: { valid: false, tooShort: true },
      }),
    );

    expect(errores.clave).toBe('Tiene que tener al menos 8 caracteres.');
  });

  it('el foco va al primer campo con error', () => {
    pintar();

    expect(screen.getByLabelText('nombre')).toHaveFocus();
  });

  it('un formulario puede explicar mejor una regla suya', () => {
    const { errores } = pintar({
      importe: { rangeUnderflow: 'Por debajo de 0,50 no se puede cobrar.' },
    });

    expect(errores.importe).toBe('Por debajo de 0,50 no se puede cobrar.');
  });

  it('al corregir un campo, su error se va', () => {
    pintar();

    fireEvent.change(screen.getByLabelText('nombre'), {
      target: { value: 'Ana' },
    });

    const errores = JSON.parse(
      screen.getByTestId('errores').textContent ?? '{}',
    ) as Record<string, string>;
    expect(errores).not.toHaveProperty('nombre');
    expect(errores).toHaveProperty('correo');
  });
});
