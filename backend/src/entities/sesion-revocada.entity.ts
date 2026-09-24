import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * Sesiones cerradas antes de caducar.
 *
 * Los tokens no se guardan en ningún sitio: basta la firma para creerlos. Eso
 * hacía que cerrar sesión solo borrara la cookie de ese navegador, y un token
 * copiado antes seguía valiendo hasta caducar. Aquí se apunta el
 * identificador de cada sesión que se cierra, y la API la rechaza aunque la
 * firma diga que sí.
 *
 * Por sesión y no por cuenta, a propósito: las cuentas de demostración las
 * usan a la vez muchos visitantes, y que uno cierre la suya no puede echar a
 * los demás.
 *
 * Cada fila solo hace falta mientras el token viviría; después ya lo rechaza
 * la firma. Las caducadas se borran al cerrar otras sesiones, sin tarea
 * programada.
 */
@Entity('sesiones_revocadas')
export class SesionRevocada {
  /** El jti del token: único por sesión. */
  @PrimaryColumn('uuid')
  jti: string;

  /** Cuándo habría caducado el token. A partir de ahí la fila sobra. */
  @Index('IDX_sesiones_revocadas_caduca')
  @Column({ type: 'timestamptz' })
  caduca: Date;
}
