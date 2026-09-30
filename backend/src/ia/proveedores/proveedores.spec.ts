import type { ConfiguracionIa } from '../ia.config';
import configIa, { TARIFAS } from '../ia.config';
import { ErrorIa, causaDesdeError } from '../errores';
import { ProveedorAnthropic } from './proveedor-anthropic';
import { ProveedorAusente } from './proveedor-ausente';

const crearMensaje = vi.fn();
const opcionesCliente: unknown[] = [];

vi.mock('@anthropic-ai/sdk', () => ({
  default: class AnthropicFalso {
    messages = { create: crearMensaje };
    constructor(opciones: unknown) {
      opcionesCliente.push(opciones);
    }
  },
}));

const CONFIG: ConfiguracionIa = {
  apiKey: 'sk-ant-prueba',
  activa: true,
  modelo: 'claude-haiku-4-5-20251001',
  topeMensualCentimos: 100,
  tiempoEsperaMs: 12000,
  maxTokensSalida: 2000,
};

const PETICION = { sistema: 'Eres un clasificador.', mensaje: 'Un fontanero' };

describe('ProveedorAnthropic', () => {
  beforeEach(() => {
    crearMensaje.mockReset();
    opcionesCliente.length = 0;
  });

  it('sin reintentos del SDK y con el plazo de la configuración', () => {
    // Los reintentos los decide el servidor: con los del SDK, una llamada
    // podía tardar tres veces el plazo y pasarse del corte del navegador.
    new ProveedorAnthropic(CONFIG);

    expect(opcionesCliente[0]).toEqual({
      apiKey: 'sk-ant-prueba',
      timeout: 12000,
      maxRetries: 0,
    });
  });

  it('pide sin temperatura, con el sistema aparte y el tope de salida', async () => {
    crearMensaje.mockResolvedValueOnce({
      content: [{ type: 'text', text: '{"categoria":"fontaneria"}' }],
      model: 'claude-haiku-4-5-20251001',
      usage: { input_tokens: 120, output_tokens: 15 },
    });

    const respuesta = await new ProveedorAnthropic(CONFIG).completar(PETICION);

    expect(crearMensaje).toHaveBeenCalledWith({
      model: CONFIG.modelo,
      max_tokens: 2000,
      temperature: 0,
      system: PETICION.sistema,
      messages: [{ role: 'user', content: PETICION.mensaje }],
    });
    expect(respuesta).toEqual({
      texto: '{"categoria":"fontaneria"}',
      modelo: 'claude-haiku-4-5-20251001',
      tokensEntrada: 120,
      tokensSalida: 15,
    });
  });

  it('junta los bloques de texto y se salta los demás', async () => {
    crearMensaje.mockResolvedValueOnce({
      content: [
        { type: 'text', text: ' {"a":' },
        { type: 'thinking', thinking: '…' },
        { type: 'text', text: '1} ' },
      ],
    });

    const respuesta = await new ProveedorAnthropic(CONFIG).completar(PETICION);

    expect(respuesta.texto).toBe('{"a":1}');
    // Sin modelo ni uso en la respuesta, lo de la configuración y cero.
    expect(respuesta).toMatchObject({
      modelo: CONFIG.modelo,
      tokensEntrada: 0,
      tokensSalida: 0,
    });
  });

  it('una respuesta sin texto es un error de formato', async () => {
    crearMensaje.mockResolvedValueOnce({ content: [] });

    await expect(
      new ProveedorAnthropic(CONFIG).completar(PETICION),
    ).rejects.toMatchObject({ causa: 'formato' });
  });

  it('un fallo del SDK se traduce a su causa, sin arrastrar el detalle', async () => {
    crearMensaje.mockRejectedValueOnce(
      Object.assign(new Error('invalid x-api-key'), { status: 401 }),
    );

    const error = await new ProveedorAnthropic(CONFIG)
      .completar(PETICION)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ErrorIa);
    expect(error).toMatchObject({
      causa: 'credencial',
      message: 'ia:credencial',
    });
  });
});

describe('ProveedorAusente', () => {
  it('no está disponible y rechaza con el motivo', async () => {
    const proveedor = new ProveedorAusente('sin-clave');

    expect(proveedor.disponible).toBe(false);
    await expect(proveedor.completar(PETICION)).rejects.toMatchObject({
      causa: 'sin-clave',
    });
  });
});

describe('causaDesdeError', () => {
  it.each([
    [undefined, 'proveedor'],
    [{ name: 'AbortError' }, 'tiempo'],
    [{ name: 'TimeoutError' }, 'tiempo'],
    [{ status: 401 }, 'credencial'],
    [{ status: 403 }, 'credencial'],
    [{ status: 529 }, 'proveedor'],
  ])('%o es «%s»', (error, causa) => {
    expect(causaDesdeError(error)).toBe(causa);
  });
});

describe('configuración de la IA', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('sin variables: sin clave, encendida, con Haiku, un euro y doce segundos', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', undefined as never);
    vi.stubEnv('IA_ACTIVA', undefined as never);
    vi.stubEnv('IA_MODELO', undefined as never);
    vi.stubEnv('IA_TOPE_MENSUAL_CENTIMOS', undefined as never);
    vi.stubEnv('IA_TIEMPO_ESPERA_MS', undefined as never);
    vi.stubEnv('IA_MAX_TOKENS_SALIDA', undefined as never);

    expect(configIa()).toEqual({
      apiKey: null,
      activa: true,
      modelo: 'claude-haiku-4-5-20251001',
      topeMensualCentimos: 100,
      tiempoEsperaMs: 12000,
      maxTokensSalida: 2000,
    });
  });

  it('IA_ACTIVA=false la apaga aunque haya clave', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-prueba');
    vi.stubEnv('IA_ACTIVA', 'false');

    expect(configIa()).toMatchObject({
      apiKey: 'sk-ant-prueba',
      activa: false,
    });
  });

  it('el modelo por defecto tiene tarifa propia', () => {
    // Sin ella se cobraría con la de por defecto, la más cara, y el tope
    // mensual se agotaría cinco veces antes de lo real.
    expect(TARIFAS['claude-haiku-4-5-20251001']).toBeDefined();
  });
});
