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
   * Coste en milésimas de céntimo, enteras.
   *
   * El acumulador es entero a propósito: en euros con decimales, sumar miles
   * de importes pequeños en coma flotante acaba desviando el total del tope.
   *
   * Lo que no funcionaba era la unidad. En céntimos enteros, una llamada que
   * cuesta cinco centésimas de céntimo se apuntaba como un céntimo entero:
   * con un tope de un euro salían unas cien llamadas al mes en vez de más de
   * mil quinientas, y el tope no medía lo que decía medir. Con esta unidad el
   * redondeo por llamada es de una milésima, que es despreciable, y la suma
   * sigue siendo entera.
   *
   * La configuración y la API pública siguen hablando en céntimos: esto es
   * detalle interno de la contabilidad.
   */
  @Column({ type: 'int', default: 0 })
  costeMilicentimos: number;

  @Column({ type: 'bigint', default: 0 })
  milisegundos: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
