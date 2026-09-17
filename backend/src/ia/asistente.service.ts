import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category, Service } from '../entities';
import { ServicesService } from '../services/services.service';
import { ampliarBusqueda, normalizar } from '../services/sinonimos';
import { ErrorIa } from './errores';
import { PresupuestoService } from './presupuesto.service';
import {
  PROVEEDOR_MODELO,
  ProveedorModelo,
} from './proveedores/proveedor-modelo.interface';

const FUNCIONALIDAD = 'asistente';

/** Lo único que el modelo puede decidir. */
interface Intencion {
  categoriaSlug: string | null;
  ciudad: string | null;
  palabrasClave: string[];
}

export interface RespuestaAsistente {
  /** De dónde salió la interpretación: del modelo o del diccionario. */
  modo: 'ia' | 'basico';
  criterios: {
    categoria: string | null;
    /** El slug acompaña al nombre para que la interfaz pueda traducirlo:
     *  el nombre llega de la base de datos siempre en castellano. */
    categoriaSlug: string | null;
    ciudad: string | null;
    texto: string | null;
  };
  servicios: Service[];
  total: number;
}

/**
 * Búsqueda en lenguaje natural.
 *
 * La regla que ordena todo el diseño: **el modelo no devuelve resultados, solo
 * una intención con enumeraciones cerradas**. Quién aparece en pantalla lo
 * decide ServicesService.search() leyendo de PostgreSQL. El modelo no puede
 * inventar un profesional, un precio ni una valoración porque su salida no
 * tiene ningún campo donde escribirlos: es un candado estructural, no una
 * instrucción en el prompt que pueda ignorar.
 *
 * Y no se expone radiusKm ni coordenadas: sin latitud y longitud el radio
 * viaja hasta la consulta y se ignora en silencio, que es la peor trampa
 * posible para algo que decide una máquina.
 */
@Injectable()
export class AsistenteService {
  private readonly logger = new Logger(AsistenteService.name);

  constructor(
    @Inject(PROVEEDOR_MODELO)
    private readonly proveedor: ProveedorModelo,
    private readonly presupuesto: PresupuestoService,
    private readonly servicios: ServicesService,
    @InjectRepository(Category)
    private readonly categorias: Repository<Category>,
    @InjectRepository(Service)
    private readonly serviciosRepo: Repository<Service>,
  ) {}

  /**
   * Catálogo cerrado sobre el que el modelo puede elegir.
   *
   * Las ciudades salen de los servicios activos y no de una lista fija: ofrecer
   * una ciudad sin oferta sería prometer resultados que no existen.
   */
  private async catalogo(): Promise<{
    categorias: { id: string; slug: string; nombre: string }[];
    ciudades: string[];
  }> {
    const [categorias, filas] = await Promise.all([
      this.categorias.find({ select: { id: true, slug: true, name: true } }),
      this.serviciosRepo
        .createQueryBuilder('s')
        .select('DISTINCT s.city', 'city')
        .where('s.isActive = true')
        .getRawMany<{ city: string }>(),
    ]);

    return {
      categorias: categorias.map((c) => ({
        id: c.id,
        slug: c.slug,
        nombre: c.name,
      })),
      ciudades: filas.map((f) => f.city).filter(Boolean),
    };
  }

  /**
   * Interpretación sin modelo: diccionario de oficios y lista de ciudades.
   *
   * Es el camino que se recorre sin clave, sin presupuesto o cuando el modelo
   * falla, y devuelve servicios reales igualmente. Por eso no hay modo
   * simulado: el usuario pierde la redacción y el multiidioma, no el servicio.
   */
  private interpretarSinModelo(
    mensaje: string,
    catalogo: {
      categorias: { slug: string; nombre: string }[];
      ciudades: string[];
    },
  ): Intencion {
    const texto = normalizar(mensaje);

    const ciudad =
      catalogo.ciudades.find((c) => {
        const n = normalizar(c);
        return new RegExp(`(^|[^a-z0-9])${n}([^a-z0-9]|$)`).test(texto);
      }) ?? null;

    // ampliarBusqueda ya traduce oficio o síntoma al nombre de la categoría.
    // ampliarBusqueda devuelve el nombre de la categoría con espacios
    // («clases particulares») y el slug lleva guiones
    // («clases-particulares»): hay que comparar con ambos aplanados.
    const aplanar = (s: string) => normalizar(s).replace(/[^a-z0-9]/g, '');
    const ampliado = ampliarBusqueda(mensaje).map(aplanar);

    // ampliarBusqueda omite a propósito el término que ya aparece en el
    // texto, porque repetirlo solo añadiría ramas OR idénticas. Eso está
    // bien para la consulta pero dejaría sin categoría a quien escribe
    // «limpieza a fondo», así que se comprueba también la coincidencia
    // directa con el nombre o el slug.
    const plano = aplanar(mensaje);
    const categoriaSlug =
      catalogo.categorias.find(
        (c) =>
          ampliado.includes(aplanar(c.slug)) ||
          plano.includes(aplanar(c.slug)) ||
          plano.includes(aplanar(c.nombre)),
      )?.slug ?? null;

    return { categoriaSlug, ciudad, palabrasClave: [] };
  }

  /** Descarta del modelo todo lo que no esté en el catálogo. */
  private validar(
    crudo: unknown,
    catalogo: { categorias: { slug: string }[]; ciudades: string[] },
  ): Intencion {
    const o = (crudo ?? {}) as Record<string, unknown>;

    const slug = typeof o.categoriaSlug === 'string' ? o.categoriaSlug : null;
    const ciudad = typeof o.ciudad === 'string' ? o.ciudad : null;

    const palabras = Array.isArray(o.palabrasClave)
      ? o.palabrasClave
          .filter((p): p is string => typeof p === 'string')
          .map((p) => p.slice(0, 20))
          .slice(0, 4)
      : [];

    return {
      // Una categoría que no existe no se corrige ni se aproxima: se descarta.
      // Aproximarla sería dejar que el modelo dirija la búsqueda por la puerta
      // de atrás.
      categoriaSlug:
        slug && catalogo.categorias.some((c) => c.slug === slug) ? slug : null,
      ciudad:
        ciudad &&
        catalogo.ciudades.some((c) => normalizar(c) === normalizar(ciudad))
          ? catalogo.ciudades.find((c) => normalizar(c) === normalizar(ciudad))!
          : null,
      palabrasClave: palabras,
    };
  }

  private prompt(catalogo: {
    categorias: { slug: string; nombre: string }[];
    ciudades: string[];
  }): string {
    return [
      'Interpretas lo que alguien necesita para su casa y lo traduces a filtros de búsqueda.',
      'Respondes SOLO con un objeto JSON, sin texto alrededor y sin vallas de código.',
      '',
      'Formato exacto:',
      '{"categoriaSlug": <slug o null>, "ciudad": <ciudad o null>, "palabrasClave": [<hasta 4 palabras>]}',
      '',
      'categoriaSlug solo puede ser uno de estos valores exactos:',
      catalogo.categorias.map((c) => `  ${c.slug} (${c.nombre})`).join('\n'),
      '',
      'ciudad solo puede ser uno de estos valores exactos:',
      catalogo.ciudades.map((c) => `  ${c}`).join('\n'),
      '',
      'Si no estás seguro de la categoría o de la ciudad, pon null. No inventes.',
      'El mensaje puede venir en cualquier idioma; los valores que devuelves son siempre los de estas listas.',
      'palabrasClave son términos de búsqueda en castellano, sin la ciudad ni la categoría.',
    ].join('\n');
  }

  async responder(mensaje: string): Promise<RespuestaAsistente> {
    const catalogo = await this.catalogo();
    let intencion = this.interpretarSinModelo(mensaje, catalogo);
    let modo: 'ia' | 'basico' = 'basico';

    if (this.proveedor.disponible) {
      // Los tokens de entrada se estiman por caracteres para poder preguntar
      // por el presupuesto ANTES de gastar. Comprobarlo después no impide nada.
      const sistema = this.prompt(catalogo);
      const estimado = Math.ceil((sistema.length + mensaje.length) / 3);

      if (
        await this.presupuesto.hayMargen(this.presupuesto.costeMaximo(estimado))
      ) {
        const inicio = Date.now();
        try {
          const respuesta = await this.proveedor.completar({
            sistema,
            mensaje,
          });
          await this.presupuesto.registrarExito(
            FUNCIONALIDAD,
            respuesta,
            Date.now() - inicio,
          );
          intencion = this.validar(this.extraerJson(respuesta.texto), catalogo);
          modo = 'ia';
        } catch (error) {
          await this.presupuesto.registrarFallo(
            FUNCIONALIDAD,
            Date.now() - inicio,
          );
          // Se registra la causa, nunca el texto: un fallo con contenido dentro
          // acabaría en Sentry, que hoy solo limpia cabeceras.
          this.logger.warn(
            `Asistente degradado: ${error instanceof ErrorIa ? error.causa : 'desconocida'}`,
          );
        }
      }
    }

    const categoria = intencion.categoriaSlug
      ? (catalogo.categorias.find((c) => c.slug === intencion.categoriaSlug) ??
        null)
      : null;

    const texto =
      intencion.palabrasClave.length > 0
        ? intencion.palabrasClave.join(' ')
        : categoria
          ? null
          : mensaje;

    // Escalera de relajación, determinista y en este orden: primero se
    // suelta el texto libre, luego la ciudad. No la decide el modelo ni
    // se redacta con él, para que el eco de los criterios aplicados sea
    // siempre cierto. «Un electricista en Barcelona» sin oferta local
    // devuelve electricistas de otras ciudades, no una página vacía.
    const intentos: {
      filtros: { categoryId?: string; city?: string; query?: string };
      ciudad: string | null;
      texto: string | null;
    }[] = [
      {
        filtros: {
          categoryId: categoria?.id,
          city: intencion.ciudad ?? undefined,
          query: texto ?? undefined,
        },
        ciudad: intencion.ciudad,
        texto,
      },
    ];

    if (categoria && texto) {
      intentos.push({
        filtros: {
          categoryId: categoria.id,
          city: intencion.ciudad ?? undefined,
        },
        ciudad: intencion.ciudad,
        texto: null,
      });
    }
    if (categoria && intencion.ciudad) {
      intentos.push({
        filtros: { categoryId: categoria.id },
        ciudad: null,
        texto: null,
      });
    }

    let elegido = intentos[0];
    let resultado = await this.buscar(elegido.filtros);
    for (let i = 1; i < intentos.length && resultado.meta === 0; i++) {
      elegido = intentos[i];
      resultado = await this.buscar(elegido.filtros);
    }

    return {
      modo,
      criterios: {
        categoria: categoria?.nombre ?? null,
        categoriaSlug: categoria?.slug ?? null,
        // Se devuelve lo que de verdad se aplicó tras relajar, no lo que
        // se pidió: decir «en Madrid» sobre resultados de toda España
        // sería mentir al usuario.
        ciudad: elegido.ciudad,
        texto: elegido.texto,
      },
      servicios: resultado.data,
      total: resultado.meta,
    };
  }

  /** El JSON puede venir con explicación alrededor pese a pedirlo limpio. */
  private extraerJson(texto: string): unknown {
    try {
      return JSON.parse(texto);
    } catch {
      const inicio = texto.indexOf('{');
      const fin = texto.lastIndexOf('}');
      if (inicio === -1 || fin <= inicio) return null;
      try {
        return JSON.parse(texto.slice(inicio, fin + 1));
      } catch {
        return null;
      }
    }
  }

  private async buscar(filtros: {
    categoryId?: string;
    city?: string;
    query?: string;
  }): Promise<{ data: Service[]; meta: number }> {
    const resultado = (await this.servicios.search({
      ...filtros,
      page: 1,
      limit: 6,
    } as Parameters<ServicesService['search']>[0])) as {
      data?: Service[];
      meta?: { total?: number };
    };

    return {
      data: resultado.data ?? [],
      meta: resultado.meta?.total ?? resultado.data?.length ?? 0,
    };
  }
}
