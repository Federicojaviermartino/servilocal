import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Recuperar la contraseña sin forma de mandar el correo: se dice. */
export const CODIGO_CORREO_NO_DISPONIBLE = 'correo-no-disponible';

/**
 * Por dónde sale el correo.
 *
 * - brevo: con BREVO_API_KEY y CORREO_REMITENTE, por su API HTTP.
 * - registro: sin clave y fuera de producción, el mensaje se escribe en el
 *   registro del servidor, para poder probar el circuito en local.
 * - apagado: sin clave en producción. No se finge que se envía: la API
 *   responde 503 con un código y la pantalla lo explica.
 */
export type ModoCorreo = 'brevo' | 'registro' | 'apagado';

export interface Correo {
  /** Sin nombre: ver correoDeRecuperacion. */
  para: { email: string };
  asunto: string;
  texto: string;
  html: string;
}

const API_BREVO = 'https://api.brevo.com/v3/smtp/email';

@Injectable()
export class CorreoService {
  private readonly logger = new Logger(CorreoService.name);
  readonly modo: ModoCorreo;

  constructor(private readonly config: ConfigService) {
    const conClave =
      !!this.config.get<string>('BREVO_API_KEY') &&
      !!this.config.get<string>('CORREO_REMITENTE');
    this.modo = conClave
      ? 'brevo'
      : this.config.get<string>('NODE_ENV') === 'production'
        ? 'apagado'
        : 'registro';

    // Al arrancar, igual que Sentry y la IA: que se vea en el registro qué
    // hay y qué no, sin tener que descubrirlo cuando alguien lo necesite.
    this.logger.log(
      {
        brevo: 'Correo por Brevo.',
        registro: 'Correo al registro del servidor: no hay BREVO_API_KEY.',
        apagado:
          'Correo apagado: sin BREVO_API_KEY no se puede recuperar la contraseña.',
      }[this.modo],
    );
  }

  get disponible(): boolean {
    return this.modo !== 'apagado';
  }

  /** Para quien llama antes de preparar nada que dependa del correo. */
  exigirDisponible(): void {
    if (!this.disponible) {
      throw new ServiceUnavailableException({
        statusCode: 503,
        codigo: CODIGO_CORREO_NO_DISPONIBLE,
        message:
          'El envío de correo no está configurado: no se puede recuperar la contraseña por correo.',
      });
    }
  }

  async enviar(correo: Correo): Promise<void> {
    this.exigirDisponible();

    if (this.modo === 'registro') {
      this.logger.warn(
        `Correo sin enviar, por falta de BREVO_API_KEY, para ${correo.para.email}: ${correo.asunto}\n${correo.texto}`,
      );
      return;
    }

    const respuesta = await fetch(API_BREVO, {
      method: 'POST',
      headers: {
        'api-key': this.config.getOrThrow<string>('BREVO_API_KEY'),
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: {
          email: this.config.getOrThrow<string>('CORREO_REMITENTE'),
          name: this.config.get<string>(
            'CORREO_REMITENTE_NOMBRE',
            'ServiLocal',
          ),
        },
        to: [{ email: correo.para.email }],
        subject: correo.asunto,
        textContent: correo.texto,
        htmlContent: correo.html,
      }),
      // Sin límite, una pasarela lenta dejaba la petición colgada.
      signal: AbortSignal.timeout(10_000),
    });

    if (!respuesta.ok) {
      throw new Error(
        `Brevo respondió ${respuesta.status}: ${(await respuesta.text()).slice(0, 200)}`,
      );
    }
  }
}
