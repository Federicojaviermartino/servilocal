import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CODIGO_CORREO_NO_DISPONIBLE, CorreoService } from './correo.service';
import { correoDeRecuperacion, IDIOMAS } from './plantillas';

/** Un ConfigService con lo justo: las variables que se le den. */
function servicio(variables: Record<string, string>): CorreoService {
  const config = {
    get: (clave: string, porDefecto?: string) => variables[clave] ?? porDefecto,
    getOrThrow: (clave: string) => {
      if (!(clave in variables)) throw new Error(`Falta ${clave}`);
      return variables[clave];
    },
  } as unknown as ConfigService;
  return new CorreoService(config);
}

const MENSAJE = correoDeRecuperacion(
  'es',
  { email: 'ana@ejemplo.org' },
  'https://servilocal-web.onrender.com/auth/restablecer?token=abc',
);

describe('CorreoService', () => {
  const fetchReal = globalThis.fetch;
  let enviado: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    enviado = vi.fn(
      async () => new Response('{"messageId":"1"}', { status: 201 }),
    );
    globalThis.fetch = enviado as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = fetchReal;
  });

  describe('con la clave de Brevo', () => {
    const CON_CLAVE = {
      BREVO_API_KEY: 'clave-de-prueba',
      CORREO_REMITENTE: 'no-responder@ejemplo.org',
    };

    it('manda por su API, con la clave en su cabecera', async () => {
      await servicio(CON_CLAVE).enviar(MENSAJE);

      const [url, peticion] = enviado.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.brevo.com/v3/smtp/email');
      expect((peticion.headers as Record<string, string>)['api-key']).toBe(
        'clave-de-prueba',
      );
      const cuerpo = JSON.parse(peticion.body as string);
      expect(cuerpo).toMatchObject({
        sender: { email: 'no-responder@ejemplo.org', name: 'ServiLocal' },
        to: [{ email: 'ana@ejemplo.org' }],
        subject: MENSAJE.asunto,
      });
      expect(cuerpo.textContent).toContain('token=abc');
    });

    it('con un tiempo límite: una pasarela lenta no deja la petición colgada', async () => {
      await servicio(CON_CLAVE).enviar(MENSAJE);

      const [, peticion] = enviado.mock.calls[0] as [string, RequestInit];
      expect(peticion.signal).toBeInstanceOf(AbortSignal);
    });

    it('si Brevo lo rechaza, falla con su respuesta', async () => {
      enviado.mockResolvedValueOnce(
        new Response('{"message":"remitente no verificado"}', { status: 400 }),
      );

      await expect(servicio(CON_CLAVE).enviar(MENSAJE)).rejects.toThrow(
        /400.*remitente no verificado/,
      );
    });

    it('sin remitente no hay modo Brevo: la clave sola no basta', () => {
      expect(servicio({ BREVO_API_KEY: 'x' }).modo).toBe('registro');
    });
  });

  describe('sin clave', () => {
    it('fuera de producción, el mensaje va al registro y no sale nada', async () => {
      const correo = servicio({ NODE_ENV: 'development' });

      await correo.enviar(MENSAJE);

      expect(correo.modo).toBe('registro');
      expect(enviado).not.toHaveBeenCalled();
    });

    it('en producción no se finge: 503 con su código', async () => {
      const correo = servicio({ NODE_ENV: 'production' });

      const error = await correo.enviar(MENSAJE).catch((e: unknown) => e);

      expect(correo.disponible).toBe(false);
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect(
        (error as ServiceUnavailableException).getResponse(),
      ).toMatchObject({ codigo: CODIGO_CORREO_NO_DISPONIBLE });
      expect(enviado).not.toHaveBeenCalled();
    });
  });
});

describe('El correo de recuperación', () => {
  it.each(IDIOMAS)('está escrito en %s', (idioma) => {
    const correo = correoDeRecuperacion(
      idioma,
      { email: 'a@b.c' },
      'https://x/auth/restablecer?token=t',
    );

    expect(correo.asunto.trim()).not.toBe('');
    expect(correo.texto).toContain('https://x/auth/restablecer?token=t');
    expect(correo.html).toContain('href="https://x/auth/restablecer?token=t"');
  });

  it('cada idioma tiene su propio texto', () => {
    const asuntos = IDIOMAS.map(
      (idioma) => correoDeRecuperacion(idioma, { email: 'a@b.c' }, 'x').asunto,
    );

    expect(new Set(asuntos).size).toBe(IDIOMAS.length);
  });

  it('el enlace no se interpreta como HTML', () => {
    const correo = correoDeRecuperacion(
      'es',
      { email: 'a@b.c' },
      'https://x/"><img src=x onerror=alert(1)>',
    );

    expect(correo.html).not.toContain('<img');
    expect(correo.html).toContain('&lt;img');
  });

  it('en árabe, de derecha a izquierda', () => {
    const correo = correoDeRecuperacion('ar', { email: 'a@b.c' }, 'https://x');

    expect(correo.html).toContain('dir="rtl"');
  });
});
