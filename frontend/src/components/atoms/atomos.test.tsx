import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import es from '../../../messages/es.json';
import Avatar from './Avatar';
import Input from './Input';
import Skeleton from './Skeleton';
import Spinner from './Spinner';

const conIdioma = (nodo: React.ReactNode) =>
  render(
    <NextIntlClientProvider locale="es" messages={es as never}>
      {nodo}
    </NextIntlClientProvider>,
  );

describe('Input', () => {
  it('asocia la etiqueta al campo aunque no se le pase identificador', () => {
    // Casi ningún uso pasa id ni name. Sin asociar, un lector de pantalla
    // anuncia «campo de texto» y no dice de qué.
    render(<Input label="Correo electrónico" />);

    expect(screen.getByLabelText('Correo electrónico')).toBeInTheDocument();
  });

  it('respeta el identificador que se le dé', () => {
    render(<Input label="Ciudad" id="ciudad" />);

    expect(screen.getByLabelText('Ciudad')).toHaveAttribute('id', 'ciudad');
  });

  it('enseña el error del campo', () => {
    render(<Input label="Correo" error="No parece un correo" />);

    expect(screen.getByText('No parece un correo')).toBeInTheDocument();
  });

  it('el error tapa a la ayuda, no se apilan los dos', () => {
    // Enseñar «así se escribe» y «está mal escrito» a la vez confunde: la
    // corrección es lo urgente.
    render(<Input label="Correo" hint="nombre@dominio.com" error="Falta la arroba" />);

    expect(screen.getByText('Falta la arroba')).toBeInTheDocument();
    expect(screen.queryByText('nombre@dominio.com')).not.toBeInTheDocument();
  });

  it('sin error sí se ve la ayuda', () => {
    render(<Input label="Correo" hint="nombre@dominio.com" />);

    expect(screen.getByText('nombre@dominio.com')).toBeInTheDocument();
  });
});

describe('Avatar', () => {
  it('sin foto enseña las iniciales', () => {
    render(<Avatar name="Federico Martino" />);

    expect(screen.getByLabelText('Federico Martino')).toHaveTextContent('FM');
  });

  it('con más de dos nombres se queda en dos iniciales', () => {
    // «MJGL» dentro de un círculo de cuarenta píxeles no se lee.
    render(<Avatar name="María José García López" />);

    expect(screen.getByLabelText('María José García López')).toHaveTextContent(
      'MJ',
    );
  });

  it('con un solo nombre no se rompe', () => {
    render(<Avatar name="Laura" />);

    expect(screen.getByLabelText('Laura')).toHaveTextContent('L');
  });

  it('con foto, el nombre queda como texto alternativo', () => {
    render(<Avatar name="Laura Gil" src="https://ejemplo.com/laura.png" />);

    expect(screen.getByAltText('Laura Gil')).toHaveAttribute(
      'src',
      'https://ejemplo.com/laura.png',
    );
  });
});

describe('Spinner', () => {
  it('se anuncia como estado y dice que está cargando', () => {
    // Un círculo girando sin nombre accesible no existe para quien no lo ve.
    conIdioma(<Spinner />);

    expect(screen.getByRole('status')).toHaveAccessibleName(es.comun.cargando);
  });
});

describe('Skeleton', () => {
  it('queda fuera del árbol accesible', () => {
    // Es una forma provisional: anunciarla solo añadiría ruido a quien
    // escucha la página.
    const { container } = render(<Skeleton className="h-4 w-20" />);

    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
  });
});
