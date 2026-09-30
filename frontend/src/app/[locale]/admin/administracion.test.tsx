import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import es from '../../../../messages/es.json';
import { UserRole } from '@/types';
import AdminPage from './page';

const metricas = vi.fn();
const reputacion = vi.fn();
const auditoria = vi.fn();
const obtenerUsuarios = vi.fn();
const alternarCuenta = vi.fn();
const obtenerCategorias = vi.fn();
const crearCategoria = vi.fn();
const actualizarCategoria = vi.fn();
const eliminarCategoria = vi.fn();
const obtenerReportadas = vi.fn();
const descartarReporte = vi.fn();
const eliminarValoracion = vi.fn();
const consumoIa = vi.fn();
const estadoIa = vi.fn();
const reemplazar = vi.fn();
const cargarSesion = vi.fn();
const avisoExito = vi.fn();
const avisoError = vi.fn();

vi.mock('@/lib/api', () => ({
  adminApi: {
    metricas: () => metricas(),
    reputacion: () => reputacion(),
    auditoria: (pagina: number) => auditoria(pagina),
  },
  usersApi: {
    getAll: () => obtenerUsuarios(),
    toggleActive: (id: string) => alternarCuenta(id),
  },
  categoriesApi: {
    getAll: () => obtenerCategorias(),
    create: (datos: unknown) => crearCategoria(datos),
    update: (id: string, datos: unknown) => actualizarCategoria(id, datos),
    remove: (id: string) => eliminarCategoria(id),
  },
  reviewsApi: {
    getReported: () => obtenerReportadas(),
    dismissReport: (id: string) => descartarReporte(id),
    remove: (id: string) => eliminarValoracion(id),
  },
  iaApi: {
    consumo: () => consumoIa(),
    estado: () => estadoIa(),
  },
}));

vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), {
    success: (m: string) => avisoExito(m),
    error: (m: string) => avisoError(m),
  }),
}));

vi.mock('@/i18n/navigation', async () => {
  const React = await import('react');
  return {
    // Como el de next-intl: la dirección puede venir como objeto.
    Link: ({
      href,
      children,
    }: {
      href: string | { pathname: string; query?: Record<string, string> };
      children: React.ReactNode;
    }) =>
      React.createElement(
        'a',
        {
          href:
            typeof href === 'string'
              ? href
              : `${href.pathname}?${new URLSearchParams(href.query)}`,
        },
        children,
      ),
    useRouter: () => ({ replace: reemplazar, push: vi.fn() }),
    usePathname: () => '/admin',
  };
});

let usuario: object | null = null;
let sesionRecordada = false;

vi.mock('@/lib/auth-store', () => ({
  // Las secciones leen solo si la cuenta es de solo lectura, con un
  // selector, como se hace con zustand; la página, el estado entero.
  useAuthStore: (seleccionar?: (estado: object) => unknown) => {
    const estado = { user: usuario, loadFromStorage: cargarSesion };
    return seleccionar ? seleccionar(estado) : estado;
  },
  haySesionRecordada: () => sesionRecordada,
}));

/**
 * Recharts no pinta en jsdom. Las gráficas se sustituyen por una pieza que
 * enseña lo que recibe, y next/dynamic por lo mismo que hace en el
 * navegador: cargar el módulo aparte y pintar el hueco mientras llega.
 */
vi.mock('next/dynamic', async () => {
  const React = await import('react');
  return {
    default: (
      cargar: () => Promise<{ default: React.ComponentType<object> }>,
      opciones: { loading: () => React.ReactNode },
    ) => {
      const Diferido = React.lazy(cargar);
      return function Dinamico(props: object) {
        return React.createElement(
          React.Suspense,
          { fallback: opciones.loading() },
          React.createElement(Diferido, props),
        );
      };
    },
  };
});

vi.mock('@/components/organisms/GraficasPanel', async () => {
  const React = await import('react');
  return {
    default: ({ datos }: { datos: unknown }) =>
      React.createElement('section', {
        'aria-label': 'Gráficas',
        'data-datos': JSON.stringify(datos),
      }),
  };
});

const ADMIN = {
  id: 'a1',
  firstName: 'Marta',
  lastName: 'Sáez',
  email: 'marta@servilocal.es',
  role: UserRole.ADMIN,
  soloLectura: false,
};

const STATS = {
  usuarios: {
    total: 42,
    porRol: [
      { clave: 'client', total: 30 },
      { clave: 'provider', total: 11 },
      { clave: 'admin', total: 1 },
    ],
    inactivos: 2,
  },
  servicios: {
    total: 25,
    activos: 20,
    sinFoto: 3,
    porCategoria: [{ clave: 'Fontanería', total: 8 }],
    porCiudad: [{ clave: 'Valencia', total: 10 }],
  },
  reservas: {
    total: 60,
    porEstado: [{ clave: 'completed', total: 40 }],
    facturado: 2400,
    porSemana: [{ semana: '2026-09-07', reservas: 5, facturado: 200 }],
  },
  valoraciones: {
    total: 50,
    media: 4.3,
    porNota: [{ clave: '5', total: 30 }],
    reportadas: 3,
    sinResponder: 4,
  },
  categorias: { total: 9, sinServicios: 1 },
};

const USUARIOS = [
  {
    id: 'u1',
    firstName: 'Ana',
    lastName: 'Núñez',
    email: 'ana@ejemplo.com',
    role: UserRole.CLIENT,
    isActive: true,
  },
  {
    id: 'u2',
    firstName: 'Luis',
    lastName: 'Gómez',
    email: 'luis@ejemplo.com',
    role: UserRole.PROVIDER,
    isActive: false,
  },
  {
    id: 'a1',
    firstName: 'Marta',
    lastName: 'Sáez',
    email: 'marta@servilocal.es',
    role: UserRole.ADMIN,
    isActive: true,
  },
];

const CATEGORIAS = [
  {
    id: 'c1',
    name: 'Hogar',
    slug: 'hogar',
    description: 'Arreglos en casa',
    children: [{ id: 'c2', name: 'Fontanería', slug: 'fontaneria' }],
  },
];

const REPORTADA = {
  id: 'r1',
  bookingId: 'abcdef12-3456-7890-abcd-ef1234567890',
  rating: 1,
  comment: 'No se presentó y no avisó.',
  client: { firstName: 'Ana', lastName: 'Núñez' },
  // A mediodía, para que la fecha sea la misma en cualquier huso horario.
  createdAt: '2026-09-15T12:00:00.000Z',
};

const REPUTACION = [
  {
    proveedorId: 'p1',
    nombre: 'Luis Gómez',
    ciudad: 'Valencia',
    activo: true,
    servicios: 3,
    serviciosActivos: 2,
    valoraciones: 12,
    media: 4.5,
    reservasCompletadas: 20,
    tasaRespuesta: 85,
  },
  {
    proveedorId: 'p2',
    nombre: 'Rosa Peña',
    ciudad: null,
    activo: false,
    servicios: 1,
    serviciosActivos: 0,
    valoraciones: 0,
    media: null,
    reservasCompletadas: 0,
    tasaRespuesta: null,
  },
];

const CONSUMO = {
  mes: '2026-09',
  llamadas: 120,
  fallos: 2,
  tokensEntrada: 5000,
  tokensSalida: 1500,
  costeCentimos: 345,
  topeCentimos: 1000,
  porcentaje: 35,
  porFuncionalidad: [
    { funcionalidad: 'buscador', llamadas: 100, fallos: 1, costeCentimos: 300 },
  ],
};

const ENTRADA = {
  id: 'e1',
  actorEmail: 'marta@servilocal.es',
  accion: 'categoria_creada',
  entidad: 'categoria',
  entidadId: 'c1',
  contexto: { nombre: 'Hogar', slug: 'hogar' },
  createdAt: '2026-09-15T12:00:00.000Z',
};

function pintar() {
  return render(
    <NextIntlClientProvider locale="es" messages={es as never}>
      <AdminPage />
    </NextIntlClientProvider>,
  );
}

/** Pinta el panel y espera a la lista de usuarios, que es la primera pestaña. */
async function pintado() {
  pintar();
  return screen.findByRole('table', { name: es.administracion.listaUsuarios });
}

/** Pinta el panel y abre otra pestaña. */
async function abrir(pestana: string) {
  await pintado();
  await userEvent.click(screen.getByRole('tab', { name: pestana }));
}

const pestana = (nombre: string) => screen.getByRole('tab', { name: nombre });

const confirmar = (respuesta: boolean) =>
  vi.spyOn(window, 'confirm').mockReturnValue(respuesta);

/** La cifra de una tarjeta de métricas, buscada por su rótulo. */
const cifra = (contenedor: HTMLElement, rotulo: string) =>
  within(contenedor).getByText(rotulo).nextElementSibling?.textContent;

beforeEach(() => {
  vi.resetAllMocks();
  usuario = ADMIN;
  sesionRecordada = false;
  metricas.mockResolvedValue({ data: STATS });
  reputacion.mockResolvedValue({ data: REPUTACION });
  auditoria.mockResolvedValue({ data: { datos: [ENTRADA], paginas: 1 } });
  obtenerUsuarios.mockResolvedValue({ data: USUARIOS });
  alternarCuenta.mockResolvedValue({ data: {} });
  obtenerCategorias.mockResolvedValue({ data: CATEGORIAS });
  crearCategoria.mockResolvedValue({ data: {} });
  actualizarCategoria.mockResolvedValue({ data: {} });
  eliminarCategoria.mockResolvedValue({ data: {} });
  obtenerReportadas.mockResolvedValue({ data: [REPORTADA] });
  descartarReporte.mockResolvedValue({ data: {} });
  eliminarValoracion.mockResolvedValue({ data: {} });
  consumoIa.mockResolvedValue({ data: CONSUMO });
  estadoIa.mockResolvedValue({ data: { disponible: true, motivo: null } });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Panel de administración', () => {
  describe('quién entra', () => {
    it('un administrador ve el panel, sin redirecciones', async () => {
      await pintado();

      expect(
        screen.getByRole('heading', {
          level: 1,
          name: es.administracion.titulo,
        }),
      ).toBeInTheDocument();
      expect(screen.getByText(es.administracion.subtitulo)).toBeInTheDocument();
      expect(cargarSesion).toHaveBeenCalled();
      expect(reemplazar).not.toHaveBeenCalled();
      // El aviso de solo lectura es para la cuenta de demostración.
      expect(
        screen.queryByText(es.administracion.soloLecturaTitulo),
      ).not.toBeInTheDocument();
    });

    it('a quien no es administrador lo manda a su panel, sin pedir nada', () => {
      // Los datos del panel solo se piden cuando ya se sabe que es admin:
      // ni las métricas deben salir hacia la API para otro papel.
      usuario = { ...ADMIN, role: UserRole.PROVIDER };

      const { container } = pintar();

      expect(reemplazar).toHaveBeenCalledWith('/dashboard');
      expect(container).toBeEmptyDOMElement();
      expect(metricas).not.toHaveBeenCalled();
    });

    it('sin usuario ni sesión recordada, manda a entrar con la vuelta apuntada', () => {
      usuario = null;

      const { container } = pintar();

      expect(reemplazar).toHaveBeenCalledWith('/auth/login?redirect=/admin');
      expect(container).toBeEmptyDOMElement();
    });

    it('con una sesión recordada que aún no se ha cargado, espera sin echar a nadie', () => {
      // En el primer render el almacén todavía está vacío: mandar a entrar
      // aquí echaría a quien ya había entrado.
      usuario = null;
      sesionRecordada = true;

      const { container } = pintar();

      expect(reemplazar).not.toHaveBeenCalled();
      expect(container).toBeEmptyDOMElement();
    });
  });

  describe('cuenta de demostración, en solo lectura', () => {
    beforeEach(() => {
      usuario = { ...ADMIN, soloLectura: true };
    });

    it('avisa antes de que nadie pulse nada', async () => {
      await pintado();

      const aviso = screen
        .getByText(es.administracion.soloLecturaTitulo)
        .closest('[role="status"]');
      expect(aviso).toHaveTextContent(es.administracion.soloLecturaTexto);
    });

    it('no deja activar ni desactivar cuentas, y dice por qué', async () => {
      await pintado();

      const botones = [
        ...screen.getAllByRole('button', {
          name: es.administracion.desactivar,
        }),
        screen.getByRole('button', { name: es.administracion.activar }),
      ];
      for (const boton of botones) {
        expect(boton).toBeDisabled();
        expect(boton).toHaveAttribute(
          'title',
          es.administracion.soloLecturaTexto,
        );
      }
    });

    it('no deja crear, editar ni eliminar categorías', async () => {
      await abrir(es.administracion.categorias);

      await screen.findByRole('table', {
        name: es.administracion.listaCategorias,
      });
      for (const nombre of [
        es.administracion.crearCategoria,
        `${es.comun.editar} Hogar`,
        `${es.comun.eliminar} Hogar`,
      ]) {
        expect(screen.getByRole('button', { name: nombre })).toBeDisabled();
      }
    });

    it('no deja moderar valoraciones', async () => {
      await abrir(es.administracion.valoracionesReportadas);

      expect(
        await screen.findByRole('button', { name: es.administracion.mantener }),
      ).toBeDisabled();
      expect(
        screen.getByRole('button', { name: es.administracion.eliminar }),
      ).toBeDisabled();
    });
  });

  describe('métricas', () => {
    it('las tarjetas enseñan los agregados del servidor', async () => {
      pintar();

      const tarjetas = await screen.findByLabelText(es.administracion.metricas);
      expect(cifra(tarjetas, es.administracion.usuarios)).toBe('42');
      expect(cifra(tarjetas, es.administracion.proveedores)).toBe('11');
      expect(cifra(tarjetas, es.administracion.categorias)).toBe('9');
      expect(cifra(tarjetas, es.administracion.reportesPendientes)).toBe('3');
    });

    it('un papel que no está en el recuento cuenta como cero', async () => {
      // El servidor solo manda los papeles que tienen a alguien: sin
      // proveedores, la tarjeta dice cero en vez de quedarse en blanco.
      metricas.mockResolvedValue({
        data: {
          ...STATS,
          usuarios: { ...STATS.usuarios, porRol: [] },
          valoraciones: { ...STATS.valoraciones, reportadas: 0 },
        },
      });
      pintar();

      const tarjetas = await screen.findByLabelText(es.administracion.metricas);
      expect(cifra(tarjetas, es.administracion.proveedores)).toBe('0');
      expect(cifra(tarjetas, es.administracion.reportesPendientes)).toBe('0');
    });

    it('las gráficas reciben las series de reservas, notas y categorías', async () => {
      pintar();

      const graficas = await screen.findByRole('region', { name: 'Gráficas' });
      expect(JSON.parse(graficas.getAttribute('data-datos')!)).toEqual({
        porSemana: STATS.reservas.porSemana,
        porEstado: STATS.reservas.porEstado,
        porNota: STATS.valoraciones.porNota,
        porCategoria: STATS.servicios.porCategoria,
      });
    });

    it('si fallan, el resto del panel sigue en pie', async () => {
      metricas.mockRejectedValue({ response: { status: 500 } });

      await pintado();

      expect(
        screen.queryByLabelText(es.administracion.metricas),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('region', { name: 'Gráficas' }),
      ).not.toBeInTheDocument();
      expect(screen.getAllByRole('tab')).toHaveLength(6);
      expect(screen.getByText('Ana Núñez')).toBeInTheDocument();
    });
  });

  describe('pestañas', () => {
    it('pulsar una pestaña cambia el contenido', async () => {
      await abrir(es.administracion.categorias);

      expect(pestana(es.administracion.categorias)).toHaveAttribute(
        'aria-selected',
        'true',
      );
      expect(pestana(es.administracion.usuarios)).toHaveAttribute(
        'aria-selected',
        'false',
      );
      expect(
        screen.getByRole('tabpanel', { name: es.administracion.categorias }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('table', { name: es.administracion.listaUsuarios }),
      ).not.toBeInTheDocument();
    });

    it('solo la pestaña activa entra en el orden del tabulador', async () => {
      // Un grupo de pestañas es una sola parada: dentro se va con flechas.
      await pintado();

      const [activa, ...resto] = screen.getAllByRole('tab');
      expect(activa).toHaveAttribute('tabindex', '0');
      for (const tab of resto) expect(tab).toHaveAttribute('tabindex', '-1');
    });

    it('las flechas, Inicio y Fin recorren las pestañas y se llevan el foco', async () => {
      await pintado();
      pestana(es.administracion.usuarios).focus();

      await userEvent.keyboard('{ArrowRight}');
      expect(pestana(es.administracion.reputacion)).toHaveFocus();
      expect(pestana(es.administracion.reputacion)).toHaveAttribute(
        'aria-selected',
        'true',
      );

      await userEvent.keyboard('{ArrowLeft}');
      expect(pestana(es.administracion.usuarios)).toHaveFocus();

      // Desde la primera, hacia atrás se da la vuelta hasta la última.
      await userEvent.keyboard('{ArrowLeft}');
      expect(pestana(es.administracion.ia)).toHaveFocus();
      expect(pestana(es.administracion.ia)).toHaveAttribute(
        'aria-selected',
        'true',
      );

      await userEvent.keyboard('{Home}');
      expect(pestana(es.administracion.usuarios)).toHaveFocus();

      await userEvent.keyboard('{End}');
      expect(pestana(es.administracion.ia)).toHaveFocus();
    });

    it('otras teclas no mueven nada', async () => {
      await pintado();
      pestana(es.administracion.usuarios).focus();

      await userEvent.keyboard('{ArrowDown}');

      expect(pestana(es.administracion.usuarios)).toHaveFocus();
      expect(pestana(es.administracion.usuarios)).toHaveAttribute(
        'aria-selected',
        'true',
      );
    });

    describe('de derecha a izquierda', () => {
      afterEach(() => {
        document.documentElement.dir = '';
      });

      it('en árabe la flecha izquierda lleva a la siguiente', async () => {
        // Las pestañas se leen de derecha a izquierda: con las flechas sin
        // invertir, «siguiente» iría hacia atrás.
        document.documentElement.dir = 'rtl';
        await pintado();
        pestana(es.administracion.usuarios).focus();

        await userEvent.keyboard('{ArrowLeft}');
        expect(pestana(es.administracion.reputacion)).toHaveFocus();

        await userEvent.keyboard('{ArrowRight}');
        expect(pestana(es.administracion.usuarios)).toHaveFocus();
      });
    });
  });

  describe('usuarios', () => {
    it('lista cada cuenta con su papel y su estado', async () => {
      const tabla = await pintado();

      const ana = within(tabla).getByRole('row', { name: /Ana Núñez/ });
      expect(ana).toHaveTextContent('ana@ejemplo.com');
      expect(ana).toHaveTextContent(es.administracion.cliente);
      expect(ana).toHaveTextContent(es.administracion.activa);

      const luis = within(tabla).getByRole('row', { name: /Luis Gómez/ });
      expect(luis).toHaveTextContent(es.administracion.proveedor);
      expect(luis).toHaveTextContent(es.administracion.inactiva);
      expect(
        within(luis).getByRole('button', { name: es.administracion.activar }),
      ).toBeEnabled();

      const marta = within(tabla).getByRole('row', { name: /Marta Sáez/ });
      expect(marta).toHaveTextContent(es.administracion.administrador);
    });

    it('los filtros por papel dejan solo a los de ese papel', async () => {
      await pintado();

      expect(
        screen.getByRole('button', {
          name: es.administracion.todos.replace('{total}', '3'),
        }),
      ).toHaveAttribute('aria-pressed', 'true');

      const clientes = screen.getByRole('button', {
        name: es.administracion.clientes.replace('{total}', '1'),
      });
      await userEvent.click(clientes);
      expect(clientes).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByText('Ana Núñez')).toBeInTheDocument();
      expect(screen.queryByText('Luis Gómez')).not.toBeInTheDocument();

      await userEvent.click(
        screen.getByRole('button', {
          name: es.administracion.proveedoresFiltro.replace('{total}', '1'),
        }),
      );
      expect(screen.getByText('Luis Gómez')).toBeInTheDocument();
      expect(screen.queryByText('Ana Núñez')).not.toBeInTheDocument();

      await userEvent.click(
        screen.getByRole('button', {
          name: es.administracion.administradores.replace('{total}', '1'),
        }),
      );
      expect(screen.getByText('Marta Sáez')).toBeInTheDocument();
      expect(screen.queryByText('Luis Gómez')).not.toBeInTheDocument();

      await userEvent.click(
        screen.getByRole('button', {
          name: es.administracion.todos.replace('{total}', '3'),
        }),
      );
      expect(screen.getByText('Luis Gómez')).toBeInTheDocument();
    });

    it('un filtro sin nadie lo dice, en vez de dejar la tabla en blanco', async () => {
      obtenerUsuarios.mockResolvedValue({ data: [USUARIOS[0]] });
      await pintado();

      await userEvent.click(
        screen.getByRole('button', {
          name: es.administracion.proveedoresFiltro.replace('{total}', '0'),
        }),
      );

      expect(
        screen.getByText(es.administracion.sinUsuarios),
      ).toBeInTheDocument();
    });

    it('desactivar pregunta con el nombre, llama a la API, avisa y recarga', async () => {
      const preguntar = confirmar(true);
      const tabla = await pintado();

      await userEvent.click(
        within(within(tabla).getByRole('row', { name: /Ana Núñez/ })).getByRole(
          'button',
          { name: es.administracion.desactivar },
        ),
      );

      expect(preguntar).toHaveBeenCalledWith(
        es.administracion.confirmarDesactivar.replace('{nombre}', 'Ana Núñez'),
      );
      await waitFor(() => expect(alternarCuenta).toHaveBeenCalledWith('u1'));
      expect(avisoExito).toHaveBeenCalledWith(
        es.administracion.cuentaDesactivada,
      );
      // La lista y las métricas se vuelven a pedir: los contadores cambian.
      await waitFor(() => expect(obtenerUsuarios).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(metricas).toHaveBeenCalledTimes(2));
    });

    it('la propia cuenta y una que eliminó su titular no se pueden cambiar, y dice por qué', async () => {
      // La API rechaza las dos cosas, y el botón dejaba pulsar para recibir
      // un «no se pudo» sin motivo.
      obtenerUsuarios.mockResolvedValue({
        data: [
          ...USUARIOS,
          {
            id: 'u9',
            firstName: 'Cuenta',
            lastName: 'eliminada',
            email: 'eliminada-u9@servilocal.invalid',
            role: UserRole.CLIENT,
            isActive: false,
            eliminadaEn: '2026-09-20T10:00:00Z',
          },
        ],
      });
      const tabla = await pintado();

      const propia = within(
        within(tabla).getByRole('row', { name: /Marta Sáez/ }),
      ).getByRole('button', { name: es.administracion.desactivar });
      expect(propia).toBeDisabled();
      expect(propia).toHaveAttribute('title', es.administracion.noDesactivarte);

      const eliminada = within(
        within(tabla).getByRole('row', { name: /Cuenta eliminada/ }),
      ).getByRole('button', { name: es.administracion.activar });
      expect(eliminada).toBeDisabled();
      expect(eliminada).toHaveAttribute(
        'title',
        es.administracion.cuentaEliminadaPorTitular,
      );
    });

    it('un rechazo con código se explica en el idioma', async () => {
      confirmar(true);
      alternarCuenta.mockRejectedValueOnce({
        response: { status: 429, data: {} },
      });
      const tabla = await pintado();

      await userEvent.click(
        within(within(tabla).getByRole('row', { name: /Ana Núñez/ })).getByRole(
          'button',
          { name: es.administracion.desactivar },
        ),
      );

      await waitFor(() =>
        expect(avisoError).toHaveBeenCalledWith(
          es.erroresApi['demasiadas-peticiones'],
        ),
      );
    });

    it('activar una cuenta inactiva pregunta y avisa con su propio texto', async () => {
      const preguntar = confirmar(true);
      await pintado();

      await userEvent.click(
        screen.getByRole('button', { name: es.administracion.activar }),
      );

      expect(preguntar).toHaveBeenCalledWith(
        es.administracion.confirmarActivar.replace('{nombre}', 'Luis Gómez'),
      );
      await waitFor(() => expect(alternarCuenta).toHaveBeenCalledWith('u2'));
      expect(avisoExito).toHaveBeenCalledWith(es.administracion.cuentaActivada);
    });

    it('si se echa atrás en la confirmación, no se toca la cuenta', async () => {
      confirmar(false);
      await pintado();

      await userEvent.click(
        screen.getByRole('button', { name: es.administracion.activar }),
      );

      expect(alternarCuenta).not.toHaveBeenCalled();
      expect(avisoExito).not.toHaveBeenCalled();
    });

    it('si la API lo rechaza, lo dice y no recarga', async () => {
      confirmar(true);
      alternarCuenta.mockRejectedValue({ response: { status: 400 } });
      await pintado();

      await userEvent.click(
        screen.getByRole('button', { name: es.administracion.activar }),
      );

      await waitFor(() =>
        expect(avisoError).toHaveBeenCalledWith(
          es.administracion.errorEstadoCuenta,
        ),
      );
      expect(avisoExito).not.toHaveBeenCalled();
      expect(obtenerUsuarios).toHaveBeenCalledTimes(1);
    });
  });

  describe('categorías', () => {
    const formulario = () =>
      screen.getByRole('form', {
        name: es.administracion.crearCategoriaFormulario,
      });
    const campo = (rotulo: string) =>
      within(formulario()).getByLabelText(rotulo);
    const abrirCategorias = async () => {
      await abrir(es.administracion.categorias);
      return screen.findByRole('table', {
        name: es.administracion.listaCategorias,
      });
    };

    it('lista las categorías con sus subcategorías debajo', async () => {
      const tabla = await abrirCategorias();

      const filas = within(tabla).getAllByRole('row').slice(1);
      expect(filas).toHaveLength(2);
      expect(filas[0]).toHaveTextContent('Hogar');
      expect(filas[0]).toHaveTextContent('Arreglos en casa');
      // La hija va detrás de su madre, con la flecha que la distingue, y
      // sin descripción enseña una raya en vez de una celda vacía.
      expect(filas[1]).toHaveTextContent('↳');
      expect(filas[1]).toHaveTextContent('Fontanería');
      expect(filas[1]).toHaveTextContent('—');
    });

    it('sin categorías invita a crear la primera', async () => {
      obtenerCategorias.mockResolvedValue({ data: [] });

      await abrirCategorias();

      expect(
        screen.getByText(es.administracion.sinCategorias),
      ).toBeInTheDocument();
    });

    it('el slug se rellena solo a partir del nombre, sin tildes ni espacios', async () => {
      await abrirCategorias();

      await userEvent.type(
        campo(es.administracion.nombre),
        'Fontanería urgente',
      );

      expect(campo(es.administracion.slug)).toHaveValue('fontaneria-urgente');
    });

    it('un slug escrito a mano ya no se pisa al seguir con el nombre', async () => {
      await abrirCategorias();
      await userEvent.type(campo(es.administracion.nombre), 'Pintura');
      await userEvent.clear(campo(es.administracion.slug));
      await userEvent.type(campo(es.administracion.slug), 'pintores');

      await userEvent.type(campo(es.administracion.nombre), ' de interiores');

      expect(campo(es.administracion.slug)).toHaveValue('pintores');
    });

    it('crear exige nombre y slug: con solo espacios no se manda nada', async () => {
      await abrirCategorias();
      await userEvent.type(campo(es.administracion.nombre), '   ');
      await userEvent.type(campo(es.administracion.slug), '   ');

      await userEvent.click(
        screen.getByRole('button', { name: es.administracion.crearCategoria }),
      );

      await waitFor(() =>
        expect(avisoError).toHaveBeenCalledWith(
          es.administracion.nombreYSlugObligatorios,
        ),
      );
      expect(crearCategoria).not.toHaveBeenCalled();
    });

    it('crear manda los datos recortados, avisa, vacía el formulario y recarga', async () => {
      await abrirCategorias();
      await userEvent.type(campo(es.administracion.nombre), ' Jardinería ');
      await userEvent.type(
        campo(es.administracion.descripcionOpcional),
        ' Poda y césped ',
      );

      await userEvent.click(
        screen.getByRole('button', { name: es.administracion.crearCategoria }),
      );

      await waitFor(() =>
        expect(crearCategoria).toHaveBeenCalledWith({
          name: 'Jardinería',
          slug: 'jardineria',
          description: 'Poda y césped',
        }),
      );
      expect(avisoExito).toHaveBeenCalledWith(
        es.administracion.categoriaCreada,
      );
      await waitFor(() => expect(obtenerCategorias).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(metricas).toHaveBeenCalledTimes(2));
      const formularioVacio = await screen.findByRole('form', {
        name: es.administracion.crearCategoriaFormulario,
      });
      expect(
        within(formularioVacio).getByLabelText(es.administracion.nombre),
      ).toHaveValue('');
      expect(
        within(formularioVacio).getByLabelText(es.administracion.slug),
      ).toHaveValue('');
    });

    it('si crear falla, lo dice y conserva lo escrito', async () => {
      crearCategoria.mockRejectedValue({ response: { status: 409 } });
      await abrirCategorias();
      await userEvent.type(campo(es.administracion.nombre), 'Mudanzas');

      await userEvent.click(
        screen.getByRole('button', { name: es.administracion.crearCategoria }),
      );

      await waitFor(() =>
        expect(avisoError).toHaveBeenCalledWith(
          es.administracion.errorCrearCategoria,
        ),
      );
      // Sin descripción no se manda una cadena vacía.
      expect(crearCategoria).toHaveBeenCalledWith({
        name: 'Mudanzas',
        slug: 'mudanzas',
        description: undefined,
      });
      expect(campo(es.administracion.nombre)).toHaveValue('Mudanzas');
    });

    it('editar abre la fila con sus valores y guardar manda los cambios', async () => {
      await abrirCategorias();

      await userEvent.click(
        screen.getByRole('button', { name: `${es.comun.editar} Hogar` }),
      );
      const nombre = screen.getByLabelText(es.administracion.editarNombre);
      expect(nombre).toHaveValue('Hogar');
      expect(screen.getByLabelText(es.administracion.editarSlug)).toHaveValue(
        'hogar',
      );
      expect(
        screen.getByLabelText(es.administracion.editarDescripcion),
      ).toHaveValue('Arreglos en casa');

      await userEvent.clear(nombre);
      await userEvent.type(nombre, 'Casa y hogar');
      const slug = screen.getByLabelText(es.administracion.editarSlug);
      await userEvent.clear(slug);
      await userEvent.type(slug, ' casa ');
      await userEvent.click(
        screen.getByRole('button', { name: es.administracion.guardarCambios }),
      );

      await waitFor(() =>
        expect(actualizarCategoria).toHaveBeenCalledWith('c1', {
          name: 'Casa y hogar',
          slug: 'casa',
          description: 'Arreglos en casa',
        }),
      );
      expect(avisoExito).toHaveBeenCalledWith(
        es.administracion.categoriaActualizada,
      );
      await waitFor(() => expect(obtenerCategorias).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(metricas).toHaveBeenCalledTimes(2));
      expect(
        screen.queryByLabelText(es.administracion.editarNombre),
      ).not.toBeInTheDocument();
    });

    it('una descripción vaciada se guarda como nula, para borrarla', async () => {
      // Con undefined la API la dejaría como estaba.
      await abrirCategorias();
      await userEvent.click(
        screen.getByRole('button', { name: `${es.comun.editar} Hogar` }),
      );

      await userEvent.clear(
        screen.getByLabelText(es.administracion.editarDescripcion),
      );
      await userEvent.click(
        screen.getByRole('button', { name: es.administracion.guardarCambios }),
      );

      await waitFor(() =>
        expect(actualizarCategoria).toHaveBeenCalledWith('c1', {
          name: 'Hogar',
          slug: 'hogar',
          description: null,
        }),
      );
    });

    it('una subcategoría sin descripción se edita con el campo vacío', async () => {
      await abrirCategorias();

      await userEvent.click(
        screen.getByRole('button', { name: `${es.comun.editar} Fontanería` }),
      );
      expect(
        screen.getByLabelText(es.administracion.editarDescripcion),
      ).toHaveValue('');
      await userEvent.click(
        screen.getByRole('button', { name: es.administracion.guardarCambios }),
      );

      await waitFor(() =>
        expect(actualizarCategoria).toHaveBeenCalledWith('c2', {
          name: 'Fontanería',
          slug: 'fontaneria',
          description: null,
        }),
      );
    });

    it('guardar sin nombre no llama a la API', async () => {
      await abrirCategorias();
      await userEvent.click(
        screen.getByRole('button', { name: `${es.comun.editar} Hogar` }),
      );

      await userEvent.clear(
        screen.getByLabelText(es.administracion.editarNombre),
      );
      await userEvent.click(
        screen.getByRole('button', { name: es.administracion.guardarCambios }),
      );

      expect(avisoError).toHaveBeenCalledWith(
        es.administracion.nombreYSlugObligatorios,
      );
      expect(actualizarCategoria).not.toHaveBeenCalled();
    });

    it('cancelar la edición deja la fila como estaba', async () => {
      const tabla = await abrirCategorias();
      await userEvent.click(
        screen.getByRole('button', { name: `${es.comun.editar} Hogar` }),
      );
      await userEvent.type(
        screen.getByLabelText(es.administracion.editarNombre),
        ' cambiado',
      );

      await userEvent.click(
        screen.getByRole('button', { name: es.administracion.cancelarEdicion }),
      );

      expect(
        screen.queryByLabelText(es.administracion.editarNombre),
      ).not.toBeInTheDocument();
      expect(within(tabla).getAllByRole('row')[1]).toHaveTextContent('Hogar');
      expect(tabla).not.toHaveTextContent('cambiado');
      expect(actualizarCategoria).not.toHaveBeenCalled();
    });

    it('si guardar falla, lo dice y la fila sigue abierta', async () => {
      actualizarCategoria.mockRejectedValue({ response: { status: 409 } });
      await abrirCategorias();
      await userEvent.click(
        screen.getByRole('button', { name: `${es.comun.editar} Hogar` }),
      );

      await userEvent.click(
        screen.getByRole('button', { name: es.administracion.guardarCambios }),
      );

      await waitFor(() =>
        expect(avisoError).toHaveBeenCalledWith(
          es.administracion.errorActualizarCategoria,
        ),
      );
      expect(
        screen.getByLabelText(es.administracion.editarNombre),
      ).toBeInTheDocument();
    });

    it('eliminar pregunta con el nombre en el idioma de la página', async () => {
      // La pregunta estaba escrita a mano en castellano en los diez idiomas.
      const preguntar = confirmar(true);
      await abrirCategorias();

      await userEvent.click(
        screen.getByRole('button', { name: `${es.comun.eliminar} Hogar` }),
      );

      expect(preguntar).toHaveBeenCalledWith(
        es.administracion.confirmarEliminarCategoria.replace(
          '{nombre}',
          'Hogar',
        ),
      );
      await waitFor(() => expect(eliminarCategoria).toHaveBeenCalledWith('c1'));
      expect(avisoExito).toHaveBeenCalledWith(
        es.administracion.categoriaEliminada,
      );
      await waitFor(() => expect(obtenerCategorias).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(metricas).toHaveBeenCalledTimes(2));
    });

    it('si se cancela la confirmación, no se elimina nada', async () => {
      confirmar(false);
      await abrirCategorias();

      await userEvent.click(
        screen.getByRole('button', { name: `${es.comun.eliminar} Hogar` }),
      );

      expect(eliminarCategoria).not.toHaveBeenCalled();
      expect(avisoExito).not.toHaveBeenCalled();
    });

    it('si eliminar falla, lo dice', async () => {
      // Lo normal es que tenga servicios asociados: el texto lo apunta.
      confirmar(true);
      eliminarCategoria.mockRejectedValue({ response: { status: 409 } });
      await abrirCategorias();

      await userEvent.click(
        screen.getByRole('button', { name: `${es.comun.eliminar} Fontanería` }),
      );

      await waitFor(() =>
        expect(avisoError).toHaveBeenCalledWith(
          es.administracion.errorEliminarCategoria,
        ),
      );
      expect(obtenerCategorias).toHaveBeenCalledTimes(1);
    });
  });

  describe('valoraciones reportadas', () => {
    const abrirReportadas = async () => {
      await abrir(es.administracion.valoracionesReportadas);
      await screen.findByText(REPORTADA.comment);
    };

    it('enseña la nota, quién la escribió, el comentario, la reserva y la fecha', async () => {
      await abrirReportadas();

      expect(screen.getByText(es.administracion.reportada)).toBeInTheDocument();
      expect(screen.getByText('1/5 · Ana Núñez')).toBeInTheDocument();
      // De la reserva, solo el principio del identificador.
      const reserva = screen.getByText(
        es.administracion.reserva.replace('{id}', 'abcdef12'),
        { exact: false },
      );
      expect(reserva).toHaveTextContent('15/9/2026');
    });

    it('una sin comentario ni autor no rompe la tarjeta', async () => {
      obtenerReportadas.mockResolvedValue({
        data: [
          {
            id: 'r2',
            bookingId: '99887766-5544-3322-1100-aabbccddeeff',
            rating: 2,
            createdAt: REPORTADA.createdAt,
          },
        ],
      });

      await abrir(es.administracion.valoracionesReportadas);

      expect(
        await screen.findByText(
          es.administracion.reserva.replace('{id}', '99887766'),
          { exact: false },
        ),
      ).toBeInTheDocument();
      expect(screen.getByText(/^2\/5 ·/)).toBeInTheDocument();
    });

    it('sin reportes pendientes lo dice', async () => {
      obtenerReportadas.mockResolvedValue({ data: [] });

      await abrir(es.administracion.valoracionesReportadas);

      expect(
        await screen.findByText(es.administracion.sinReportes),
      ).toBeInTheDocument();
    });

    it('mantenerla descarta el reporte: pregunta, llama, avisa y recarga', async () => {
      const preguntar = confirmar(true);
      await abrirReportadas();

      await userEvent.click(
        screen.getByRole('button', { name: es.administracion.mantener }),
      );

      expect(preguntar).toHaveBeenCalledWith(
        es.administracion.confirmarDescartar,
      );
      await waitFor(() => expect(descartarReporte).toHaveBeenCalledWith('r1'));
      expect(eliminarValoracion).not.toHaveBeenCalled();
      expect(avisoExito).toHaveBeenCalledWith(
        es.administracion.reporteDescartado,
      );
      await waitFor(() => expect(obtenerReportadas).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(metricas).toHaveBeenCalledTimes(2));
    });

    it('eliminarla: pregunta, llama, avisa y recarga', async () => {
      const preguntar = confirmar(true);
      await abrirReportadas();

      await userEvent.click(
        screen.getByRole('button', { name: es.administracion.eliminar }),
      );

      expect(preguntar).toHaveBeenCalledWith(
        es.administracion.confirmarEliminarValoracion,
      );
      await waitFor(() =>
        expect(eliminarValoracion).toHaveBeenCalledWith('r1'),
      );
      expect(descartarReporte).not.toHaveBeenCalled();
      expect(avisoExito).toHaveBeenCalledWith(
        es.administracion.valoracionEliminada,
      );
      await waitFor(() => expect(obtenerReportadas).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(metricas).toHaveBeenCalledTimes(2));
    });

    it('si se echa atrás, no se toca nada', async () => {
      confirmar(false);
      await abrirReportadas();

      await userEvent.click(
        screen.getByRole('button', { name: es.administracion.mantener }),
      );
      await userEvent.click(
        screen.getByRole('button', { name: es.administracion.eliminar }),
      );

      expect(descartarReporte).not.toHaveBeenCalled();
      expect(eliminarValoracion).not.toHaveBeenCalled();
    });

    it.each([
      {
        boton: es.administracion.mantener,
        peticion: descartarReporte,
        error: es.administracion.errorDescartar,
      },
      {
        boton: es.administracion.eliminar,
        peticion: eliminarValoracion,
        error: es.administracion.errorEliminarValoracion,
      },
    ])('si «$boton» falla, lo dice', async ({ boton, peticion, error }) => {
      confirmar(true);
      peticion.mockRejectedValue({ response: { status: 500 } });
      await abrirReportadas();

      await userEvent.click(screen.getByRole('button', { name: boton }));

      await waitFor(() => expect(avisoError).toHaveBeenCalledWith(error));
      expect(avisoExito).not.toHaveBeenCalled();
      expect(obtenerReportadas).toHaveBeenCalledTimes(1);
    });
  });

  describe('reputación', () => {
    it('pinta a cada profesional tal como llega, con la media en el formato del idioma', async () => {
      await abrir(es.administracion.reputacion);

      const tabla = await screen.findByRole('table', {
        name: es.administracion.listaReputacion,
      });
      expect(
        screen.getByText(es.administracion.reputacionAyuda),
      ).toBeInTheDocument();

      const luis = within(tabla).getByRole('row', { name: /Luis Gómez/ });
      expect(luis).toHaveTextContent('Valencia');
      expect(luis).toHaveTextContent('4,50');
      expect(luis).toHaveTextContent('2/3');
      // El porcentaje también, como se escribe en castellano: con espacio.
      expect(luis).toHaveTextContent(/85\s%/);
      expect(luis).toHaveTextContent(es.administracion.activa);
    });

    it('sin valoraciones, la nota queda en blanco y no a cero', async () => {
      // Un cero es una nota pésima; lo que pasa es que aún no hay opiniones.
      await abrir(es.administracion.reputacion);

      const tabla = await screen.findByRole('table', {
        name: es.administracion.listaReputacion,
      });
      const rosa = within(tabla).getByRole('row', { name: /Rosa Peña/ });
      expect(rosa).toHaveTextContent(es.administracion.sinNota);
      expect(rosa).toHaveTextContent(es.administracion.inactiva);
      // Ni ciudad ni tasa de respuesta: una raya en cada una.
      expect(within(rosa).getAllByText('—')).toHaveLength(2);
    });

    it('sin profesionales lo dice', async () => {
      reputacion.mockResolvedValue({ data: [] });

      await abrir(es.administracion.reputacion);

      expect(
        await screen.findByText(es.administracion.sinReputacion),
      ).toBeInTheDocument();
    });
  });

  describe('consumo de IA', () => {
    const abrirIa = async () => {
      await abrir(es.administracion.ia);
      await screen.findByText(es.administracion.iaTitulo);
    };

    it('con la capa activa enseña el mes, el gasto, las cifras y el reparto', async () => {
      await abrirIa();

      expect(screen.getByText(es.administracion.iaActiva)).toBeInTheDocument();
      expect(
        screen.getByText(es.administracion.iaMes.replace('{mes}', '2026-09')),
      ).toBeInTheDocument();
      expect(screen.getByText(/3,45\s€ de 10,00\s€/)).toBeInTheDocument();
      expect(screen.getByText('35 %')).toBeInTheDocument();
      expect(
        screen.getByRole('progressbar', {
          name: es.administracion.iaGastoEtiqueta,
        }),
      ).toHaveAttribute('aria-valuenow', '35');

      const panel = screen.getByRole('tabpanel', {
        name: es.administracion.ia,
      });
      expect(cifra(panel, es.administracion.iaTokensEntrada)).toBe('5000');
      expect(cifra(panel, es.administracion.iaTokensSalida)).toBe('1500');

      const reparto = screen.getByRole('table', {
        name: es.administracion.iaRepartoTitulo,
      });
      const buscador = within(reparto).getByRole('row', { name: /buscador/ });
      expect(buscador).toHaveTextContent('100');
      expect(buscador).toHaveTextContent(/3,00\s€/);
      expect(
        screen.queryByText(es.administracion.iaInactivaTexto),
      ).not.toBeInTheDocument();
    });

    it('pasado el tope, la barra se queda en el 100 % y lo avisa', async () => {
      // Pasado el tope la capa deja de llamar al modelo: la barra no se
      // desborda, pero la cifra sí dice cuánto se ha pasado.
      consumoIa.mockResolvedValue({
        data: { ...CONSUMO, porcentaje: 120, costeCentimos: 1200 },
      });
      estadoIa.mockResolvedValue({
        data: { disponible: false, motivo: 'presupuesto' },
      });

      await abrirIa();

      expect(
        screen.getByText(es.administracion.iaSinPresupuesto),
      ).toBeInTheDocument();
      expect(screen.getByText('120 %')).toBeInTheDocument();
      expect(
        screen.getByRole('progressbar', {
          name: es.administracion.iaGastoEtiqueta,
        }),
      ).toHaveAttribute('aria-valuenow', '100');
    });

    it('con la capa apagada lo explica, para que los ceros no parezcan una avería', async () => {
      consumoIa.mockResolvedValue({
        data: {
          ...CONSUMO,
          llamadas: 0,
          fallos: 0,
          costeCentimos: 0,
          porcentaje: 0,
          porFuncionalidad: [],
        },
      });
      estadoIa.mockResolvedValue({
        data: { disponible: false, motivo: 'inactiva' },
      });

      await abrirIa();

      expect(
        screen.getByText(es.administracion.iaInactiva),
      ).toBeInTheDocument();
      expect(
        screen.getByText(es.administracion.iaInactivaTexto),
      ).toBeInTheDocument();
      // Sin llamadas no hay reparto que enseñar.
      expect(
        screen.queryByRole('table', {
          name: es.administracion.iaRepartoTitulo,
        }),
      ).not.toBeInTheDocument();
    });

    it('si el estado llega vacío, se da por inactiva sin inventar el motivo', async () => {
      estadoIa.mockResolvedValue({ data: null });

      await abrirIa();

      expect(
        screen.getByText(es.administracion.iaInactiva),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(es.administracion.iaInactivaTexto),
      ).not.toBeInTheDocument();
    });

    it('si el consumo llega vacío, la pestaña se queda vacía en vez de romperse', async () => {
      consumoIa.mockResolvedValue({ data: null });

      await abrir(es.administracion.ia);

      await waitFor(() => expect(estadoIa).toHaveBeenCalled());
      const panel = screen.getByRole('tabpanel', {
        name: es.administracion.ia,
      });
      await waitFor(() => expect(panel).toBeEmptyDOMElement());
    });
  });

  describe('auditoría', () => {
    const abrirAuditoria = async () => {
      await abrir(es.administracion.auditoria);
      return screen.findByRole('table', { name: es.auditoria.lista });
    };

    it('enseña quién hizo qué, con la acción y los campos en palabras', async () => {
      const tabla = await abrirAuditoria();

      expect(auditoria).toHaveBeenCalledWith(1);
      expect(screen.getByText(es.auditoria.ayuda)).toBeInTheDocument();
      const [, fila] = within(tabla).getAllByRole('row');
      expect(fila).toHaveTextContent('marta@servilocal.es');
      expect(fila).toHaveTextContent(es.auditoria.categoria_creada);
      expect(fila).toHaveTextContent(`${es.auditoria.campo_nombre}: Hogar`);
      expect(fila).toHaveTextContent(`${es.auditoria.campo_slug}: hogar`);
      // La hora cuenta tanto como el día: dos moderaciones seguidas sobre
      // la misma cuenta solo se distinguen así. La hora exacta depende del
      // huso de quien ejecuta la prueba; que esté, no.
      expect(fila).toHaveTextContent(/15\/9\/26,? \d{1,2}:\d{2}/);
    });

    it('una acción o un campo que el catálogo no conoce salen tal cual', async () => {
      // Mejor el nombre en crudo que un hueco en blanco.
      auditoria.mockResolvedValue({
        data: {
          datos: [
            {
              ...ENTRADA,
              accion: 'accion_futura',
              contexto: { motivo: 'Spam', origen: 'api' },
            },
          ],
          paginas: 1,
        },
      });

      const tabla = await abrirAuditoria();

      const [, fila] = within(tabla).getAllByRole('row');
      expect(fila).toHaveTextContent('accion_futura');
      expect(fila).toHaveTextContent(`${es.auditoria.campo_motivo}: Spam`);
      expect(fila).toHaveTextContent('campo_origen: api');
    });

    it('sin contexto, o con uno vacío, el detalle es una raya', async () => {
      auditoria.mockResolvedValue({
        data: {
          datos: [
            { ...ENTRADA, id: 'e2', contexto: null },
            { ...ENTRADA, id: 'e3', contexto: {} },
          ],
          paginas: 1,
        },
      });

      const tabla = await abrirAuditoria();

      const filas = within(tabla).getAllByRole('row').slice(1);
      expect(filas).toHaveLength(2);
      for (const fila of filas) {
        expect(within(fila).getByText('—')).toBeInTheDocument();
      }
    });

    it('sin entradas lo dice, y no hay páginas que recorrer', async () => {
      auditoria.mockResolvedValue({ data: { datos: [], paginas: 1 } });

      await abrirAuditoria();

      expect(screen.getByText(es.auditoria.sinEntradas)).toBeInTheDocument();
      expect(
        screen.queryByRole('navigation', { name: es.paginacion.navegacion }),
      ).not.toBeInTheDocument();
    });

    it('cambiar de página pide esa página', async () => {
      auditoria.mockImplementation(async (pagina: number) => ({
        data: {
          datos: [
            {
              ...ENTRADA,
              id: `e${pagina}`,
              actorEmail: `admin${pagina}@servilocal.es`,
            },
          ],
          paginas: 3,
        },
      }));
      await abrirAuditoria();
      expect(screen.getByText('admin1@servilocal.es')).toBeInTheDocument();

      await userEvent.click(
        screen.getByRole('button', {
          name: es.paginacion.pagina.replace('{numero}', '2'),
        }),
      );

      expect(
        await screen.findByText('admin2@servilocal.es'),
      ).toBeInTheDocument();
      expect(auditoria).toHaveBeenLastCalledWith(2);
      expect(
        screen.getByRole('button', {
          name: es.paginacion.pagina.replace('{numero}', '2'),
        }),
      ).toHaveAttribute('aria-current', 'page');

      await userEvent.click(
        screen.getByRole('button', { name: es.paginacion.siguiente }),
      );

      expect(
        await screen.findByText('admin3@servilocal.es'),
      ).toBeInTheDocument();
      expect(auditoria).toHaveBeenLastCalledWith(3);
    });
  });

  describe('cuando una sección no carga', () => {
    // Una lista vacía y una petición fallida no pueden verse igual: la
    // primera dice «no hay nada»; la segunda, que no se ha podido preguntar.
    it.each([
      { seccion: es.administracion.usuarios, peticion: obtenerUsuarios },
      { seccion: es.administracion.reputacion, peticion: reputacion },
      { seccion: es.administracion.categorias, peticion: obtenerCategorias },
      {
        seccion: es.administracion.valoracionesReportadas,
        peticion: obtenerReportadas,
      },
      { seccion: es.administracion.auditoria, peticion: auditoria },
      { seccion: es.administracion.ia, peticion: consumoIa },
    ])(
      '«$seccion» lo dice, con la referencia, y deja reintentar',
      async ({ seccion, peticion }) => {
        peticion.mockRejectedValueOnce({
          response: { status: 500, headers: { 'x-request-id': 'req-123' } },
        });
        pintar();
        await userEvent.click(
          await screen.findByRole('tab', { name: seccion }),
        );

        const aviso = await screen.findByRole('alert');
        expect(aviso).toHaveTextContent(es.carga.error);
        expect(within(aviso).getByText('req-123')).toBeInTheDocument();

        await userEvent.click(
          within(aviso).getByRole('button', { name: es.carga.reintentar }),
        );

        await waitFor(() => expect(peticion).toHaveBeenCalledTimes(2));
        await waitFor(() =>
          expect(screen.queryByRole('alert')).not.toBeInTheDocument(),
        );
      },
    );

    it('con la sesión caducada ofrece volver a entrar, no reintentar', async () => {
      // El remedio no es repetir la petición, sino iniciar sesión otra vez.
      obtenerUsuarios.mockRejectedValue({ response: { status: 401 } });

      pintar();

      expect(
        await screen.findByRole('link', { name: es.carga.entrarDeNuevo }),
      ).toHaveAttribute('href', '/auth/login?redirect=%2Fadmin');
      expect(screen.getByText(es.carga.sesionCaducada)).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: es.carga.reintentar }),
      ).not.toBeInTheDocument();
    });
  });
});
