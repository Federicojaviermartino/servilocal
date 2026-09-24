import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category, Service } from '../entities';
import { ServicesService } from '../services/services.service';
import {
  extraerJson,
  interpretarSinModelo,
  promptDeSistema,
  validarIntencion,
} from './interpretacion';
import { ErrorIa } from './errores';
import { PresupuestoService } from './presupuesto.service';
import {
  PROVEEDOR_MODELO,
  ProveedorModelo,
} from './proveedores/proveedor-modelo.interface';

const FUNCIONALIDAD = 'asistente';

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

  async responder(mensaje: string): Promise<RespuestaAsistente> {
    const catalogo = await this.catalogo();
    let intencion = interpretarSinModelo(mensaje, catalogo);
    let modo: 'ia' | 'basico' = 'basico';

    if (this.proveedor.disponible) {
      // Los tokens de entrada se estiman por caracteres para poder preguntar
      // por el presupuesto ANTES de gastar. Comprobarlo después no impide nada.
      const sistema = promptDeSistema(catalogo);
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
          intencion = validarIntencion(extraerJson(respuesta.texto), catalogo);
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
