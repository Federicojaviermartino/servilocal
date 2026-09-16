import type { Meta, StoryObj } from '@storybook/nextjs';
import { SERVICIO_EJEMPLO, otroServicio } from '../../../.storybook/datos';
import PanelAsistente from './PanelAsistente';

// El panel va anclado a la esquina inferior, así que la ficha necesita alto
// donde anclarse; si no, se superpone al borde del marco.
const meta = {
  title: 'Organisms/PanelAsistente',
  component: PanelAsistente,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Historia) => (
      <div className="relative h-[560px] bg-fondo">
        <Historia />
      </div>
    ),
  ],
  args: {
    mensaje: '',
    onMensajeChange: () => {},
    onEnviar: (evento) => evento.preventDefault(),
    onCerrar: () => {},
  },
} satisfies Meta<typeof PanelAsistente>;

export default meta;
type Historia = StoryObj<typeof meta>;

const FONTANEROS = [
  SERVICIO_EJEMPLO,
  otroServicio('grifos', {
    title: 'Reparación de grifos y fugas',
    priceMin: 35,
    priceMax: 60,
    city: 'Madrid',
    averageRating: 4.8,
    totalReviews: 23,
    images: [],
  }),
];

export const Vacio: Historia = {
  name: 'Sin consulta',
};

export const Escribiendo: Historia = {
  name: 'Escribiendo',
  args: { mensaje: 'Se me ha roto el grifo de la cocina' },
};

export const Buscando: Historia = {
  name: 'Buscando',
  args: { mensaje: 'Se me ha roto el grifo de la cocina', enviando: true },
};

export const ConResultados: Historia = {
  name: 'Con resultados',
  args: {
    mensaje: 'Se me ha roto el grifo de la cocina',
    respuesta: {
      modo: 'ia',
      criterios: { categoria: 'Fontanería', ciudad: 'Madrid', texto: null },
      servicios: FONTANEROS,
      total: FONTANEROS.length,
    },
  },
};

// Cuando el servidor suelta la ciudad para no devolver una página vacía, el
// panel lo dice: mantener «Madrid» sobre resultados de toda España sería
// mentir sobre la búsqueda que se ha hecho.
export const CiudadRelajada: Historia = {
  name: 'Ciudad relajada',
  args: {
    mensaje: 'Un electricista en Soria',
    respuesta: {
      modo: 'ia',
      criterios: { categoria: 'Electricidad', ciudad: null, texto: null },
      servicios: [SERVICIO_EJEMPLO],
      total: 1,
    },
  },
};

// Sin clave, sin presupuesto o con el modelo caído se busca igualmente con el
// diccionario de oficios, y se avisa de que se ha hecho sin asistente.
export const ModoBasico: Historia = {
  name: 'Modo básico',
  args: {
    mensaje: 'un fontanero',
    respuesta: {
      modo: 'basico',
      criterios: { categoria: 'Fontanería', ciudad: null, texto: null },
      servicios: [SERVICIO_EJEMPLO],
      total: 1,
    },
  },
};

export const SinResultados: Historia = {
  name: 'Sin resultados',
  args: {
    mensaje: 'necesito un domador de leones',
    respuesta: {
      modo: 'ia',
      criterios: { categoria: null, ciudad: null, texto: 'domador leones' },
      servicios: [],
      total: 0,
    },
  },
};

export const Fallo: Historia = {
  name: 'Error',
  args: { mensaje: 'Se me ha roto el grifo', error: true },
};
