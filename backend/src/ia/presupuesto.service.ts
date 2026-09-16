import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsoIa } from '../entities/uso-ia.entity';
import { ConfiguracionIa, TARIFAS, TARIFA_POR_DEFECTO } from './ia.config';
import { RespuestaModelo } from './proveedores/proveedor-modelo.interface';

export interface ConsumoPorFuncionalidad {
  funcionalidad: string;
  llamadas: number;
  fallos: number;
  costeCentimos: number;
}

export interface ResumenConsumo {
  mes: string;
  llamadas: number;
  fallos: number;
  tokensEntrada: number;
  tokensSalida: number;
  costeCentimos: number;
  topeCentimos: number;
  porcentaje: number;
  /** Quién se está gastando el tope. Un total sin reparto dice que hay un
   *  problema, pero no dónde. */
  porFuncionalidad: ConsumoPorFuncionalidad[];
}

/** Día natural en ISO, que es como se guarda la columna. */
function hoy(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Primer día del mes en curso, para acotar la suma del tope. */
function inicioDeMes(): string {
  return hoy().slice(0, 7) + '-01';
}

/**
 * Contabilidad y tope de gasto de la capa de IA.
 *
 * Dos reglas que no se negocian:
 *
 * 1. Se pregunta antes de gastar. El tope se comprueba contra el coste máximo
 *    posible de la llamada que se va a lanzar, no contra el que resulte
 *    después: comprobar a posteriori no impide nada.
 * 2. Se registra también lo que falla. Una llamada que agota el tiempo se ha
 *    pagado igual en latencia y a veces en tokens, y si no aparece en ningún
 *    sitio nadie se entera de que la funcionalidad está rota.
 *
 * Honestidad sobre el límite: la comprobación ocurre antes de conocer el coste
 * real, así que varias llamadas simultáneas pueden rebasar el tope por unos
 * céntimos. Con estos volúmenes da igual, pero conviene decirlo en vez de
 * escribir que está acotado por construcción.
 */
@Injectable()
export class PresupuestoService {
  private readonly logger = new Logger(PresupuestoService.name);

  constructor(
    @InjectRepository(UsoIa)
    private readonly uso: Repository<UsoIa>,
    private readonly config: ConfigService,
  ) {}

  private get ajustes(): ConfiguracionIa {
    return this.config.get<ConfiguracionIa>('ia') as ConfiguracionIa;
  }

  private tarifa(modelo: string) {
    return TARIFAS[modelo] ?? TARIFA_POR_DEFECTO;
  }

  /** Coste en céntimos de un número concreto de tokens. */
  calcularCoste(
    modelo: string,
    tokensEntrada: number,
    tokensSalida: number,
  ): number {
    const t = this.tarifa(modelo);
    const centimos =
      (tokensEntrada * t.entrada + tokensSalida * t.salida) / 1_000_000;
    // Se redondea hacia arriba: nunca conviene contabilizar de menos lo que se
    // está gastando.
    return Math.ceil(centimos);
  }

  /** Gastado en el mes en curso, en céntimos. */
  async gastadoEsteMes(): Promise<number> {
    const fila = await this.uso
      .createQueryBuilder('u')
      .select('COALESCE(SUM(u.costeCentimos), 0)', 'suma')
      .where('u.fecha >= :desde', { desde: inicioDeMes() })
      .getRawOne<{ suma: string }>();
    return Number(fila?.suma ?? 0);
  }

  /**
   * ¿Queda margen para una llamada que como mucho costará esto?
   *
   * Se le pasa el peor caso: los tokens de entrada ya recortados más el techo
   * de salida configurado.
   */
  async hayMargen(costeMaximoCentimos: number): Promise<boolean> {
    const tope = this.ajustes.topeMensualCentimos;
    if (tope <= 0) return false;
    const gastado = await this.gastadoEsteMes();
    return gastado + costeMaximoCentimos <= tope;
  }

  /** Coste máximo de una llamada, para preguntar antes de lanzarla. */
  costeMaximo(tokensEntradaEstimados: number): number {
    const { modelo, maxTokensSalida } = this.ajustes;
    return this.calcularCoste(modelo, tokensEntradaEstimados, maxTokensSalida);
  }

  async registrarExito(
    funcionalidad: string,
    respuesta: RespuestaModelo,
    milisegundos: number,
  ): Promise<void> {
    const coste = this.calcularCoste(
      respuesta.modelo,
      respuesta.tokensEntrada,
      respuesta.tokensSalida,
    );
    await this.acumular(funcionalidad, {
      llamadas: 1,
      fallos: 0,
      tokensEntrada: respuesta.tokensEntrada,
      tokensSalida: respuesta.tokensSalida,
      costeCentimos: coste,
      milisegundos,
    });
  }

  async registrarFallo(
    funcionalidad: string,
    milisegundos: number,
  ): Promise<void> {
    await this.acumular(funcionalidad, {
      llamadas: 1,
      fallos: 1,
      tokensEntrada: 0,
      tokensSalida: 0,
      costeCentimos: 0,
      milisegundos,
    });
  }

  /**
   * Suma sobre la fila del día sin leerla antes.
   *
   * Un INSERT ... ON CONFLICT DO UPDATE evita la carrera entre dos peticiones
   * simultáneas que leerían el mismo valor y guardarían la misma suma.
   */
  private async acumular(
    funcionalidad: string,
    delta: {
      llamadas: number;
      fallos: number;
      tokensEntrada: number;
      tokensSalida: number;
      costeCentimos: number;
      milisegundos: number;
    },
  ): Promise<void> {
    // ON CONFLICT DO UPDATE sumando sobre el valor existente. El orUpdate del
    // constructor de consultas sobrescribe la columna con el valor entrante en
    // lugar de acumularlo, que aquí daría siempre uno.
    const sql = `
      INSERT INTO uso_ia
        (fecha, funcionalidad, llamadas, fallos,
         "tokensEntrada", "tokensSalida", "costeCentimos", milisegundos)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (fecha, funcionalidad) DO UPDATE SET
        llamadas        = uso_ia.llamadas + EXCLUDED.llamadas,
        fallos          = uso_ia.fallos + EXCLUDED.fallos,
        "tokensEntrada" = uso_ia."tokensEntrada" + EXCLUDED."tokensEntrada",
        "tokensSalida"  = uso_ia."tokensSalida" + EXCLUDED."tokensSalida",
        "costeCentimos" = uso_ia."costeCentimos" + EXCLUDED."costeCentimos",
        milisegundos    = uso_ia.milisegundos + EXCLUDED.milisegundos,
        "updatedAt"     = now()
    `;

    try {
      await this.uso.query(sql, [
        hoy(),
        funcionalidad,
        delta.llamadas,
        delta.fallos,
        delta.tokensEntrada,
        delta.tokensSalida,
        delta.costeCentimos,
        delta.milisegundos,
      ]);
    } catch {
      // Un fallo al contabilizar no puede tumbar la petición que ya se
      // atendió, pero tampoco puede pasar inadvertido: sin contabilidad el
      // tope de gasto deja de funcionar.
      this.logger.error(
        `No se pudo registrar el consumo de IA (${funcionalidad})`,
      );
    }
  }

  async resumen(): Promise<ResumenConsumo> {
    const fila = await this.uso
      .createQueryBuilder('u')
      .select('COALESCE(SUM(u.llamadas), 0)', 'llamadas')
      .addSelect('COALESCE(SUM(u.fallos), 0)', 'fallos')
      .addSelect('COALESCE(SUM(u.tokensEntrada), 0)', 'tokensEntrada')
      .addSelect('COALESCE(SUM(u.tokensSalida), 0)', 'tokensSalida')
      .addSelect('COALESCE(SUM(u.costeCentimos), 0)', 'costeCentimos')
      .where('u.fecha >= :desde', { desde: inicioDeMes() })
      .getRawOne<Record<string, string>>();

    const reparto = await this.uso
      .createQueryBuilder('u')
      .select('u.funcionalidad', 'funcionalidad')
      .addSelect('COALESCE(SUM(u.llamadas), 0)', 'llamadas')
      .addSelect('COALESCE(SUM(u.fallos), 0)', 'fallos')
      .addSelect('COALESCE(SUM(u.costeCentimos), 0)', 'costeCentimos')
      .where('u.fecha >= :desde', { desde: inicioDeMes() })
      .groupBy('u.funcionalidad')
      .orderBy('SUM(u."costeCentimos")', 'DESC')
      .getRawMany<Record<string, string>>();

    const tope = this.ajustes.topeMensualCentimos;
    const coste = Number(fila?.costeCentimos ?? 0);

    return {
      mes: hoy().slice(0, 7),
      llamadas: Number(fila?.llamadas ?? 0),
      fallos: Number(fila?.fallos ?? 0),
      tokensEntrada: Number(fila?.tokensEntrada ?? 0),
      tokensSalida: Number(fila?.tokensSalida ?? 0),
      costeCentimos: coste,
      topeCentimos: tope,
      porcentaje: tope > 0 ? Math.round((coste / tope) * 100) : 100,
      porFuncionalidad: reparto.map((f) => ({
        funcionalidad: f.funcionalidad,
        llamadas: Number(f.llamadas),
        fallos: Number(f.fallos),
        costeCentimos: Number(f.costeCentimos),
      })),
    };
  }
}
