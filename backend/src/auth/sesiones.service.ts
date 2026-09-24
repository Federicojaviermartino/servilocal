import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { SesionRevocada } from '../entities';
import { AUDIENCIA_API } from './sesion';

/**
 * Cerrar una sesión de verdad, no solo en el navegador.
 *
 * Ver la entidad SesionRevocada: cada token lleva un identificador propio, y
 * al salir ese identificador se apunta como cerrado hasta que el token habría
 * caducado de todos modos.
 */
@Injectable()
export class SesionesService {
  constructor(
    @InjectRepository(SesionRevocada)
    private readonly revocadas: Repository<SesionRevocada>,
    private readonly jwt: JwtService,
  ) {}

  /** Si la sesión se cerró antes de caducar. */
  estaRevocada(jti: string): Promise<boolean> {
    return this.revocadas.existsBy({ jti });
  }

  /**
   * Cierra la sesión de un token: desde aquí la API lo rechaza aunque la
   * firma sea buena.
   *
   * Un token que ya no vale —caducado, mal firmado, de otra audiencia— no se
   * apunta: la firma ya lo rechaza, y apuntar lo que llegue sin comprobarlo
   * dejaría a cualquiera llenar la tabla.
   */
  async revocar(token: string | null): Promise<void> {
    if (!token) return;

    let carga: { jti?: string; exp?: number };
    try {
      carga = await this.jwt.verifyAsync(token, { audience: AUDIENCIA_API });
    } catch {
      return;
    }
    if (!carga.jti || !carga.exp) return;

    // upsert y no insert: cerrar dos veces la misma sesión, desde dos
    // pestañas, no es un error.
    await this.revocadas.upsert(
      { jti: carga.jti, caduca: new Date(carga.exp * 1000) },
      ['jti'],
    );

    // Las que ya caducaron sobran: el token lo rechaza la firma sola. Se
    // aprovecha cada cierre para barrerlas, sin tarea programada que olvidar.
    await this.revocadas.delete({ caduca: LessThan(new Date()) });
  }
}
