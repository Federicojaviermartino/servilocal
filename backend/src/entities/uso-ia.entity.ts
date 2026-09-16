import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Consumo de la capa de IA, acumulado por día y funcionalidad.
 *
 * Vive en PostgreSQL y no en memoria a propósito. En Render la instancia se
 * duerme a los quince minutos, así que un contador en proceso se vacía varias
 * veces al día: un tope de gasto apoyado en él no es un tope, solo lo parece.
 *
 * Una fila por día y funcionalidad en lugar de una por llamada: para decidir si
 * queda presupuesto basta con la suma del mes, y así la tabla no crece sin
 * control.
 */
@Entity('uso_ia')
@Index(['fecha', 'funcionalidad'], { unique: true })
export class UsoIa {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Día natural en formato ISO, sin hora. */
  @Column({ type: 'date' })
  fecha: string;

  @Column({ length: 60 })
  funcionalidad: string;

  @Column({ type: 'int', default: 0 })
  llamadas: number;

  /** Llamadas que terminaron en error del proveedor o en tiempo agotado. */
  @Column({ type: 'int', default: 0 })
  fallos: number;

  @Column({ type: 'bigint', default: 0 })
  tokensEntrada: number;

  @Column({ type: 'bigint', default: 0 })
  tokensSalida: number;

  /**
   * Coste en céntimos enteros. En euros con decimales, sumar miles de importes
   * pequeños en coma flotante acaba desviando el total del tope.
   */
  @Column({ type: 'int', default: 0 })
  costeCentimos: number;

  @Column({ type: 'bigint', default: 0 })
  milisegundos: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
