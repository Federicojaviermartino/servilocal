import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import es from '../../../messages/es.json';
import GraficasPanel, { type DatosGraficas } from './GraficasPanel';

/**
 * Recharts no pinta en jsdom: su contenedor mide cero y no dibuja nada. Se
 * sustituye por piezas que enseñan lo que reciben, porque lo que hay que
 * comprobar es lo que decide este componente antes de pasárselo —el orden,
 * los colores, las etiquetas, lo que se recorta—, no que Recharts dibuje.
 */
const leyenda: { formatear?: (clave: string) => React.ReactNode } = {};

vi.mock('recharts', async () => {
  const React = await import('react');
  const grafica = (tipo: string) => {
    const Grafica = ({
      data,
      children,
    }: {
      data?: unknown;
      children?: React.ReactNode;
    }) =>
      React.createElement(
        'section',
        { 'data-grafica': tipo, 'data-datos': JSON.stringify(data ?? null) },
        children,
      );
    return Grafica;
  };
  const serie = ({
    dataKey,
    data,
    children,
  }: {
    dataKey: string;
    data?: unknown;
    children?: React.ReactNode;
  }) =>
    React.createElement(
      'div',
      { 'data-serie': dataKey, 'data-datos': JSON.stringify(data ?? null) },
      children,
    );
  return {
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) =>
      children,
    AreaChart: grafica('area'),
    BarChart: grafica('barras'),
    PieChart: grafica('tarta'),
    Area: serie,
    Bar: serie,
    Pie: serie,
    Cell: ({ fill }: { fill: string }) =>
      React.createElement('i', { 'data-color': fill }),
    Legend: ({
      formatter,
    }: {
      formatter: (clave: string) => React.ReactNode;
    }) => {
      leyenda.formatear = formatter;
      return null;
    },
    Tooltip: () => null,
    XAxis: () => null,
    YAxis: () => null,
  };
});

const VERDE = '#15803d';
const AMBAR = '#d97706';

function datos(extra: Partial<DatosGraficas> = {}): DatosGraficas {
  return {
    porSemana: [
      { semana: '2026-09-07', reservas: 4, facturado: 320 },
      { semana: '2026-09-14', reservas: 0, facturado: 0 },
    ],
    porEstado: [
      { clave: 'completed', total: 12 },
      { clave: 'cancelled', total: 3 },
    ],
    porNota: [
      { clave: '5', total: 9 },
      { clave: '2', total: 1 },
      { clave: '4', total: 6 },
    ],
    porCategoria: [{ clave: 'Fontanería', total: 5 }],
    ...extra,
  };
}

function pintar(d: DatosGraficas) {
  return render(
    <NextIntlClientProvider locale="es" messages={es as never}>
      <GraficasPanel datos={d} />
    </NextIntlClientProvider>,
  );
}

const leer = (elemento: Element | null) =>
  JSON.parse(elemento?.getAttribute('data-datos') ?? 'null');

describe('GraficasPanel', () => {
  it('pinta las cuatro gráficas con su título', () => {
    pintar(datos());

    for (const clave of [
      'graficaReservasSemana',
      'graficaPorNota',
      'graficaPorEstado',
      'graficaPorCategoria',
    ] as const) {
      expect(
        screen.getByRole('heading', { name: es.administracion[clave] }),
      ).toBeInTheDocument();
    }
  });

  it('las semanas se rotulan con día y mes, sin el año', () => {
    // Doce etiquetas con el año entero se amontonan hasta no leerse.
    const { container } = pintar(datos());

    const semanas = leer(container.querySelector('[data-grafica="area"]'));
    expect(semanas.map((s: { etiqueta: string }) => s.etiqueta)).toEqual([
      '07/09',
      '14/09',
    ]);
  });

  it('una semana a cero se pinta a cero: aquí no se rellena nada', () => {
    const { container } = pintar(datos());

    const semanas = leer(container.querySelector('[data-grafica="area"]'));
    expect(semanas[1]).toMatchObject({ reservas: 0, facturado: 0 });
  });

  it('las notas van de menor a mayor, aunque lleguen desordenadas', () => {
    const { container } = pintar(datos());

    const notas = leer(
      container.querySelectorAll('[data-grafica="barras"]')[0],
    );
    expect(notas.map((n: { clave: string }) => n.clave)).toEqual([
      '2',
      '4',
      '5',
    ]);
  });

  it('las notas bajas en ámbar y las buenas en verde', () => {
    // Lo que hay que mirar primero tiene que saltar a la vista.
    const { container } = pintar(datos());

    const colores = Array.from(
      container
        .querySelectorAll('[data-grafica="barras"]')[0]
        .querySelectorAll('[data-color]'),
    ).map((c) => c.getAttribute('data-color'));
    expect(colores).toEqual([AMBAR, VERDE, VERDE]);
  });

  it('cada estado tiene su color, y uno desconocido no rompe nada', () => {
    const { container } = pintar(
      datos({
        porEstado: [
          { clave: 'completed', total: 1 },
          { clave: 'cancelled', total: 1 },
          { clave: 'inventado', total: 1 },
        ],
      }),
    );

    const colores = Array.from(
      container
        .querySelector('[data-grafica="tarta"]')!
        .querySelectorAll('[data-color]'),
    ).map((c) => c.getAttribute('data-color'));
    expect(colores[0]).toBe(VERDE);
    expect(colores[1]).toBe('#b91c1c');
    expect(colores[2]).toBe('rgb(var(--color-borde))');
  });

  it('la leyenda de los estados está en palabras, no en claves', () => {
    // Sin leyenda los segmentos solo se distinguían por el color.
    pintar(datos());

    render(<>{leyenda.formatear!('completed')}</>);
    render(<>{leyenda.formatear!('inventado')}</>);

    expect(screen.getByText(es.estados.completada)).toBeInTheDocument();
    // Un estado que el catálogo no conoce sale tal cual, no en blanco.
    expect(screen.getByText('inventado')).toBeInTheDocument();
  });

  it('solo las ocho primeras categorías, que la API manda ya ordenadas', () => {
    // Con más, las etiquetas se solapan; el reparto entero está en su
    // pestaña. Aquí no se reordena: el orden lo decide la consulta.
    const porCategoria = Array.from({ length: 11 }, (_, i) => ({
      clave: `Categoría ${i + 1}`,
      total: 20 - i,
    }));
    const { container } = pintar(datos({ porCategoria }));

    const categorias = leer(
      container.querySelectorAll('[data-grafica="barras"]')[1],
    );
    expect(categorias).toHaveLength(8);
    expect(categorias[0].clave).toBe('Categoría 1');
  });
});
