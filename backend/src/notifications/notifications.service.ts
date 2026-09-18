import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification, NotificationType } from '../entities';
import { TiempoRealGateway } from '../common/tiempo-real/tiempo-real.gateway';

/** Cuántos avisos se devuelven de una vez. */
const LIMITE = 20;

export interface AvisoNuevo {
  usuarioId: string;
  tipo: NotificationType;
  /** Valores que la interfaz interpola en la frase traducida. */
  datos?: Record<string, string>;
  /** A dónde lleva al pulsarlo. Relativa, sin idioma: lo pone el cliente. */
  enlace?: string;
}

/**
 * Avisos de la plataforma.
 *
 * La tabla y el enumerado existían desde la migración inicial y no los usaba
 * nadie: aceptar o rechazar una reserva no avisaba al cliente, que se
 * enteraba recargando. Esto los conecta.
 *
 * El texto no se guarda traducido. Se guarda el tipo y los datos para
 * interpolar, y la frase la compone la interfaz con el catálogo del
 * visitante. Guardar «Tu reserva ha sido confirmada» dejaría ese aviso en
 * castellano para siempre, aunque quien lo lea se pase al alemán mañana.
 * Los campos title y content se rellenan igualmente como respaldo, por si
 * algún día aparece un tipo que el catálogo no conozca.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly avisos: Repository<Notification>,
    private readonly tiempoReal: TiempoRealGateway,
  ) {}

  /**
   * Crea un aviso y lo empuja por socket.
   *
   * No lanza nunca. Un aviso es un añadido: que falle no puede tumbar la
   * operación que lo provocó, porque entonces confirmar una reserva fallaría
   * por no poder avisar de que se ha confirmado.
   */
  async crear(aviso: AvisoNuevo): Promise<Notification | null> {
    try {
      const guardado = await this.avisos.save(
        this.avisos.create({
          userId: aviso.usuarioId,
          type: aviso.tipo,
          title: aviso.tipo,
          content: JSON.stringify(aviso.datos ?? {}),
          actionUrl: aviso.enlace,
        }),
      );

      this.tiempoReal.notificarAviso(aviso.usuarioId, guardado);
      return guardado;
    } catch (error) {
      this.logger.warn(
        `No se pudo crear el aviso ${aviso.tipo}: ${
          error instanceof Error ? error.message : 'desconocido'
        }`,
      );
      return null;
    }
  }

  async listar(usuarioId: string): Promise<Notification[]> {
    return this.avisos.find({
      where: { userId: usuarioId },
      order: { createdAt: 'DESC' },
      take: LIMITE,
    });
  }

  async sinLeer(usuarioId: string): Promise<number> {
    return this.avisos.count({ where: { userId: usuarioId, isRead: false } });
  }

  /**
   * Marca uno como leído.
   *
   * Filtra por usuario además de por identificador: sin eso, conocer el
   * identificador de un aviso ajeno bastaría para marcarlo, que es poco daño
   * pero es tocar lo de otro.
   */
  async marcarLeido(id: string, usuarioId: string): Promise<Notification> {
    const aviso = await this.avisos.findOne({
      where: { id, userId: usuarioId },
    });
    if (!aviso) throw new NotFoundException('Aviso no encontrado');

    aviso.isRead = true;
    aviso.readAt = new Date();
    return this.avisos.save(aviso);
  }

  async marcarTodosLeidos(usuarioId: string): Promise<{ marcados: number }> {
    const resultado = await this.avisos.update(
      { userId: usuarioId, isRead: false },
      { isRead: true, readAt: new Date() },
    );
    return { marcados: resultado.affected ?? 0 };
  }
}
