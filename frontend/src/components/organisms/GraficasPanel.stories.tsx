import type { Meta, StoryObj } from '@storybook/nextjs';
import GraficasPanel from './GraficasPanel';

const meta = {
  title: 'Organisms/GraficasPanel',
  component: GraficasPanel,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof GraficasPanel>;

export default meta;
type Historia = StoryObj<typeof meta>;

// Doce semanas con dos vacías al principio, que es justo lo que devuelve el
// servidor: rellena los huecos para que la línea no una fechas lejanas.
const SEMANAS = [
  ['2026-06-29', 0, 0],
  ['2026-07-06', 0, 0],
  ['2026-07-13', 4, 1210],
  ['2026-07-20', 7, 2480],
  ['2026-07-27', 3, 6319],
  ['2026-08-03', 9, 8689],
  ['2026-08-10', 18, 23901],
  ['2026-08-17', 20, 23869],
  ['2026-08-24', 16, 15989],
  ['2026-08-31', 10, 1634],
  ['2026-09-07', 3, 285],
  ['2026-09-14', 6, 0],
].map(([semana, reservas, facturado]) => ({
  semana: semana as string,
  reservas: reservas as number,
  facturado: facturado as number,
}));

const DATOS = {
  porSemana: SEMANAS,
  porEstado: [
    { clave: 'completed', total: 41 },
    { clave: 'confirmed', total: 18 },
    { clave: 'pending', total: 14 },
    { clave: 'cancelled', total: 8 },
    { clave: 'rejected', total: 4 },
  ],
  porNota: [
    { clave: '5', total: 38 },
    { clave: '4', total: 24 },
    { clave: '3', total: 9 },
    { clave: '2', total: 5 },
    { clave: '1', total: 3 },
  ],
  porCategoria: [
    { clave: 'Fontanería', total: 6 },
    { clave: 'Electricidad', total: 5 },
    { clave: 'Limpieza', total: 4 },
    { clave: 'Clases particulares', total: 4 },
    { clave: 'Carpintería', total: 3 },
    { clave: 'Jardinería', total: 2 },
  ],
};

// Cambiando el tema en la barra se ve que los ejes y el emergente siguen al
// tema: los colores salen de las mismas variables CSS que el resto.
export const Completo: Historia = {
  name: 'Con datos',
  args: { datos: DATOS },
};

// Lo que ve una instalación recién sembrada. Las gráficas tienen que
// sostenerse vacías en lugar de descuadrarse.
export const SinDatos: Historia = {
  name: 'Sin datos',
  args: {
    datos: {
      porSemana: SEMANAS.map((s) => ({ ...s, reservas: 0, facturado: 0 })),
      porEstado: [],
      porNota: [],
      porCategoria: [],
    },
  },
};

// Las notas bajas se pintan en ámbar: en un reparto así es lo primero que
// tiene que saltar a la vista.
export const MalasValoraciones: Historia = {
  name: 'Valoraciones malas',
  args: {
    datos: {
      ...DATOS,
      porNota: [
        { clave: '5', total: 2 },
        { clave: '4', total: 3 },
        { clave: '3', total: 11 },
        { clave: '2', total: 19 },
        { clave: '1', total: 27 },
      ],
    },
  },
};
