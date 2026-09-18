import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Repository } from 'typeorm';
import { User } from '../../entities';
import { JwtPayload } from '../../auth/strategies/jwt.strategy';
import { origenesPermitidos } from '../origenes';

/** Sala privada de cada persona. Nadie la pide: se la asigna el servidor. */
function salaDe(usuarioId: string): string {
  return `usuario:${usuarioId}`;
}

/**
 * Tiempo real: mensajes y avisos.
 *
 * La decisión que ordena todo el diseño: **hay una sala por persona, no una
 * por conversación, y el cliente nunca pide entrar en ninguna**. Al conectarse
 * se le mete en la suya y solo en la suya; al guardar un mensaje, el servidor
 * emite a las salas de los dos participantes, que ya conoce porque las leyó de
 * la conversación.
 *
 * Así no existe un «únete a la conversación X» que alguien pueda pedir con la
 * X de otro. No es que esté prohibido: es que no hay puerta. Con salas por
 * conversación habría que validar cada solicitud, y esa validación es
 * exactamente el sitio donde se cuelan los fallos.
 *
 * El apretón de manos exige un token válido y de alguien activo. Sin él la
 * conexión se cierra, porque un socket anónimo dentro de una sala privada
 * sería peor que no tener tiempo real.
 */
@WebSocketGateway({
  namespace: '/mensajes',
  cors: { origin: origenesPermitidos(), credentials: true },
})
export class TiempoRealGateway implements OnGatewayConnection {
  private readonly logger = new Logger(TiempoRealGateway.name);

  @WebSocketServer()
  private server: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @InjectRepository(User)
    private readonly usuarios: Repository<User>,
  ) {}

  async handleConnection(cliente: Socket): Promise<void> {
    try {
      const usuarioId = await this.identificar(cliente);
      cliente.data.usuarioId = usuarioId;
      await cliente.join(salaDe(usuarioId));
    } catch {
      // Sin detalle hacia fuera: decirle a quien lo intenta si falló el token
      // o el usuario es ayudarle a afinar el siguiente intento.
      cliente.emit('sesion-invalida');
      cliente.disconnect(true);
    }
  }

  /**
   * Token del apretón de manos, nunca de la URL: las cadenas de consulta
   * acaban en los registros del servidor y en los del proxy de delante.
   */
  private async identificar(cliente: Socket): Promise<string> {
    const token = cliente.handshake?.auth?.token;
    if (typeof token !== 'string' || !token) {
      throw new Error('sin token');
    }

    const carga = await this.jwt.verifyAsync<JwtPayload>(token, {
      secret: this.config.get<string>('JWT_SECRET'),
    });

    // Se comprueba contra la base de datos y no solo la firma: un token
    // sigue siendo válido después de desactivar la cuenta, y entonces la
    // firma diría que sí a alguien a quien la aplicación ya dice que no.
    const usuario = await this.usuarios.findOne({
      where: { id: carga.sub, isActive: true },
      select: { id: true },
    });
    if (!usuario) throw new Error('usuario inactivo');

    return usuario.id;
  }

  /**
   * Avisa a los dos participantes de una conversación.
   *
   * Los identificadores los pone quien guarda el mensaje, leídos de la propia
   * conversación. El emisor también recibe el suyo, para que sus otras
   * pestañas y su teléfono se enteren.
   *
   * A cada uno se le manda quién es su interlocutor, que es lo que necesita
   * para saber si el mensaje va a la conversación que tiene abierta. El
   * mensaje guardado no sirve para eso: lleva conversationId y senderId,
   * pero no destinatario, así que quien escribe no reconocería el suyo.
   * No se revela nada: son los dos únicos de la conversación.
   */
  /**
   * Avisa a una sola persona.
   *
   * Comparte sala y conexión con los mensajes: abrir un segundo socket para
   * las notificaciones gastaría el doble de ranuras del servidor sin ganar
   * nada, y el reparto por salas ya estaba resuelto.
   */
  notificarAviso(usuarioId: string, aviso: unknown): void {
    if (!this.server) return;
    this.server.to(salaDe(usuarioId)).emit('aviso-nuevo', aviso);
  }

  notificarMensaje(participantes: [string, string], mensaje: unknown): void {
    // Si nadie ha abierto todavía un socket no hay servidor que usar: la
    // mensajería tiene que seguir funcionando por HTTP igualmente.
    if (!this.server) return;

    const [uno, otro] = participantes;
    const destinos =
      uno === otro
        ? [{ id: uno, interlocutorId: otro }]
        : [
            { id: uno, interlocutorId: otro },
            { id: otro, interlocutorId: uno },
          ];

    for (const destino of destinos) {
      this.server.to(salaDe(destino.id)).emit('mensaje-nuevo', {
        mensaje,
        interlocutorId: destino.interlocutorId,
      });
    }
  }
}
