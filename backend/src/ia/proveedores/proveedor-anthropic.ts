import Anthropic from '@anthropic-ai/sdk';
import { ConfiguracionIa } from '../ia.config';
import { ErrorIa, causaDesdeError } from '../errores';
import {
  PeticionModelo,
  ProveedorModelo,
  RespuestaModelo,
} from './proveedor-modelo.interface';

export class ProveedorAnthropic implements ProveedorModelo {
  readonly disponible = true;
  readonly nombre: string;

  private readonly cliente: Anthropic;

  constructor(private readonly config: ConfiguracionIa) {
    this.nombre = config.modelo;
    this.cliente = new Anthropic({
      apiKey: config.apiKey as string,
      // El tiempo va en milisegundos y los reintentos se apagan a propósito:
      // un solo reintento del SDK se come el presupuesto de 25 s con el que
      // el navegador aborta, y además duplica el coste de una llamada que ya
      // ha fallado. Aquí se prefiere degradar rápido.
      timeout: config.tiempoEsperaMs,
      maxRetries: 0,
    });
  }

  async completar(peticion: PeticionModelo): Promise<RespuestaModelo> {
    let respuesta;
    try {
      respuesta = await this.cliente.messages.create({
        model: this.config.modelo,
        max_tokens: this.config.maxTokensSalida,
        system: peticion.sistema,
        messages: [{ role: 'user', content: peticion.mensaje }],
      });
    } catch (error) {
      // Se descarta el error original: puede llevar dentro el texto enviado, y
      // de ahí acabaría en Sentry, que hoy solo limpia cabeceras.
      throw new ErrorIa(causaDesdeError(error));
    }

    // La respuesta puede traer bloques que no son texto (razonamiento, uso
    // de herramientas); solo interesa el texto y en el orden en que viene.
    const texto = respuesta.content
      .map((bloque) => (bloque.type === 'text' ? bloque.text : ''))
      .join('')
      .trim();

    if (!texto) {
      // Sin texto útil no hay nada que validar después; se trata como fallo de
      // formato para que quien llame degrade en lugar de pintar un hueco.
      throw new ErrorIa('formato');
    }

    return {
      texto,
      modelo: respuesta.model ?? this.config.modelo,
      tokensEntrada: respuesta.usage?.input_tokens ?? 0,
      tokensSalida: respuesta.usage?.output_tokens ?? 0,
    };
  }
}
