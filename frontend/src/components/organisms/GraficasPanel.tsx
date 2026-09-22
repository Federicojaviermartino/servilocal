/**
 * Nivel atómico: Organismo
 * Componente: GraficasPanel (visualización de las métricas del panel)
 *
 * Solo pinta lo que recibe. Los datos vienen ya agregados de
 * GET /api/admin/metricas, que los resuelve en la base de datos: aquí no se
 * suma, ni se calcula un porcentaje, ni se rellena un hueco. Si una semana
 * viene a cero es porque estaba a cero.
 */
'use client';
import { useTranslations } from 'next-intl';
import { CLAVE_ESTADO } from '@/lib/estados';
import { BookingStatus } from '@/types';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface Recuento {
  clave: string;
  total: number;
}

export interface DatosGraficas {
  porSemana: { semana: string; reservas: number; facturado: number }[];
  porEstado: Recuento[];
  porNota: Recuento[];
  porCategoria: Recuento[];
}

// Los tokens semánticos cambian con el tema y Recharts necesita colores
// explícitos, así que se leen de las mismas variables CSS que usa el resto de
// la interfaz. Una paleta aparte se quedaría clara sobre el fondo oscuro.
const EJE = 'rgb(var(--color-tenue))';
const REJILLA = 'rgb(var(--color-borde))';

const AZUL = '#1a56db';
// Los estados tienen significado: lo cobrado en verde, lo perdido en rojo. Un
// degradado cualquiera obligaría a mirar la leyenda para entender el reparto.
const COLOR_ESTADO: Record<string, string> = {
  completed: '#15803d',
  confirmed: '#1a56db',
  pending: '#d97706',
  cancelled: '#b91c1c',
  rejected: '#737373',
};

function Caja({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-borde p-4">
      <h3 className="mb-4 text-sm font-semibold text-principal">{titulo}</h3>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          {children as React.ReactElement}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

const ejeComun = {
  stroke: EJE,
  fontSize: 12,
  tickLine: false,
  axisLine: { stroke: REJILLA },
};

const emergente = {
  contentStyle: {
    background: 'rgb(var(--color-superficie))',
    border: '1px solid rgb(var(--color-borde))',
    borderRadius: '0.5rem',
    color: 'rgb(var(--color-principal))',
    fontSize: '0.8rem',
  },
  // Recharts pinta el nombre del dato con el color de su serie, que aquí son
  // hexadecimales fijos elegidos para destacar sobre el fondo del gráfico.
  // Sobre el fondo del emergente en tema oscuro, alguno se queda por debajo
  // del contraste exigido. El color ya lo lleva el cuadrito de la izquierda;
  // el texto no tiene por qué repetirlo.
  itemStyle: { color: 'rgb(var(--color-principal))' },
  labelStyle: { color: 'rgb(var(--color-secundario))' },
};

export default function GraficasPanel({ datos }: { datos: DatosGraficas }) {
  const t = useTranslations('administracion');
  const tEstados = useTranslations('estados');

  /** El estado en palabras, con la misma tabla que usa el resto de vistas. */
  const nombreEstado = (clave: string) => {
    const enCatalogo = CLAVE_ESTADO[clave as BookingStatus];
    return enCatalogo ? tEstados(enCatalogo) : clave;
  };

  // Día y mes bastan: el año entero en doce etiquetas las amontona.
  const semanas = datos.porSemana.map((p) => ({
    ...p,
    etiqueta: p.semana.slice(8) + '/' + p.semana.slice(5, 7),
  }));

  const notas = [...datos.porNota].sort(
    (a, b) => Number(a.clave) - Number(b.clave),
  );

  // Con muchas categorías las etiquetas se solapan hasta ser ilegibles; el
  // reparto largo ya está en la pestaña correspondiente.
  const categorias = datos.porCategoria.slice(0, 8);

  return (
    <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="lg:col-span-2">
        <Caja titulo={t('graficaReservasSemana')}>
          <AreaChart data={semanas} margin={{ left: -20, right: 8, top: 4 }}>
            <defs>
              <linearGradient
                id="degradadoReservas"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor={AZUL} stopOpacity={0.35} />
                <stop offset="100%" stopColor={AZUL} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <XAxis dataKey="etiqueta" {...ejeComun} />
            <YAxis allowDecimals={false} {...ejeComun} />
            <Tooltip {...emergente} />
            <Area
              type="monotone"
              dataKey="reservas"
              name={t('graficaReservas')}
              stroke={AZUL}
              strokeWidth={2}
              fill="url(#degradadoReservas)"
            />
          </AreaChart>
        </Caja>
      </div>

      <Caja titulo={t('graficaPorNota')}>
        <BarChart data={notas} margin={{ left: -20, right: 8, top: 4 }}>
          <XAxis dataKey="clave" {...ejeComun} />
          <YAxis allowDecimals={false} {...ejeComun} />
          <Tooltip {...emergente} />
          <Bar
            dataKey="total"
            name={t('graficaValoraciones')}
            radius={[4, 4, 0, 0]}
          >
            {notas.map((n) => (
              // Las notas bajas en ámbar: es lo que hay que mirar primero.
              <Cell
                key={n.clave}
                fill={Number(n.clave) >= 4 ? '#15803d' : '#d97706'}
              />
            ))}
          </Bar>
        </BarChart>
      </Caja>

      <Caja titulo={t('graficaPorEstado')}>
        <PieChart>
          <Tooltip {...emergente} />
          {/* Sin leyenda, los segmentos solo se distinguían por el color y
              solo se podían leer pasando el ratón por encima: en un móvil no
              hay ratón, con teclado no se llega, y quien no distingue esos
              colores no tiene nada. Las otras tres gráficas llevan ejes
              rotulados; esta se había quedado sin equivalente. */}
          <Legend
            verticalAlign="bottom"
            height={36}
            formatter={(clave: string) => (
              <span className="text-xs text-secundario">
                {nombreEstado(clave)}
              </span>
            )}
          />
          <Pie
            data={datos.porEstado}
            dataKey="total"
            nameKey="clave"
            innerRadius={45}
            outerRadius={80}
            paddingAngle={2}
          >
            {datos.porEstado.map((e) => (
              <Cell
                key={e.clave}
                fill={COLOR_ESTADO[e.clave] ?? REJILLA}
                stroke="rgb(var(--color-superficie))"
              />
            ))}
          </Pie>
        </PieChart>
      </Caja>

      <div className="lg:col-span-2">
        <Caja titulo={t('graficaPorCategoria')}>
          <BarChart
            data={categorias}
            layout="vertical"
            margin={{ left: 40, right: 16, top: 4 }}
          >
            <XAxis type="number" allowDecimals={false} {...ejeComun} />
            <YAxis type="category" dataKey="clave" width={130} {...ejeComun} />
            <Tooltip {...emergente} />
            <Bar
              dataKey="total"
              name={t('graficaServicios')}
              fill={AZUL}
              radius={[0, 4, 4, 0]}
            />
          </BarChart>
        </Caja>
      </div>
    </div>
  );
}
