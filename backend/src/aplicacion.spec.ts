import { Body, Controller, Get, Post } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';
import { configurarAplicacion } from './aplicacion';

class EcoDto {
  @IsString()
  texto: string;

  @IsOptional()
  @IsBoolean()
  marcado?: boolean;

  @IsOptional()
  @IsNumber()
  cantidad?: number;
}

@Controller('eco')
class EcoController {
  @Get()
  leer() {
    return { ok: true };
  }

  @Post()
  escribir(@Body() dto: EcoDto) {
    return dto;
  }
}

/**
 * Lo que main.ts pone alrededor de los módulos. La prueba de permisos lo usa
 * para arrancar la aplicación entera; aquí se comprueba pieza a pieza.
 */
describe('configurarAplicacion', () => {
  const WEB = 'https://servilocal-web.onrender.com';
  let app: NestExpressApplication;
  let base: string;

  beforeAll(async () => {
    vi.stubEnv('CORS_ORIGINS', WEB);
    const modulo = await Test.createTestingModule({
      controllers: [EcoController],
    }).compile();
    app = modulo.createNestApplication<NestExpressApplication>({
      logger: false,
    });
    configurarAplicacion(app);
    await app.listen(0, '127.0.0.1');
    base = (await app.getUrl()).replace('[::1]', '127.0.0.1');
  });

  afterAll(async () => {
    await app?.close();
    vi.unstubAllEnvs();
  });

  it('todo cuelga de /api, con la versión 1 y sin ella', async () => {
    expect((await fetch(`${base}/api/eco`)).status).toBe(200);
    expect((await fetch(`${base}/api/v1/eco`)).status).toBe(200);
    expect((await fetch(`${base}/eco`)).status).toBe(404);
  });

  it('cada respuesta lleva su identificador y las cabeceras de seguridad', async () => {
    const respuesta = await fetch(`${base}/api/eco`);

    expect(respuesta.headers.get('x-request-id')).toMatch(/^[\w-]{8,}$/);
    expect(respuesta.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('la web puede leer la respuesta y su identificador; otra, no', async () => {
    const propia = await fetch(`${base}/api/eco`, {
      headers: { origin: WEB },
    });
    const ajena = await fetch(`${base}/api/eco`, {
      headers: { origin: 'https://otra.example' },
    });

    expect(propia.headers.get('access-control-allow-origin')).toBe(WEB);
    expect(propia.headers.get('access-control-allow-credentials')).toBe('true');
    expect(propia.headers.get('access-control-expose-headers')).toContain(
      'X-Request-Id',
    );
    expect(ajena.headers.get('access-control-allow-origin')).toBeNull();
  });

  describe('lo que se contesta a quien trae una sesión', () => {
    const cache = async (cabeceras: Record<string, string> = {}) =>
      (await fetch(`${base}/api/eco`, { headers: cabeceras })).headers.get(
        'cache-control',
      );

    it('con la cookie de sesión, no se guarda en ninguna caché', async () => {
      // Sin decir nada, quedaba a criterio del navegador: en un ordenador
      // compartido podía seguir en el disco después de salir de la cuenta.
      expect(
        await cache({ cookie: 'tema=oscuro; sesion=un.token.cualquiera' }),
      ).toBe('no-store');
    });

    it('con un token en la cabecera, tampoco', async () => {
      expect(await cache({ authorization: 'Bearer un.token.cualquiera' })).toBe(
        'no-store',
      );
    });

    it('a quien no trae ninguna no se le dice nada: lo público se puede guardar', async () => {
      expect(await cache()).toBeNull();
      expect(await cache({ cookie: 'tema=oscuro' })).toBeNull();
    });
  });

  const enviar = (cuerpo: unknown) =>
    fetch(`${base}/api/eco`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(cuerpo),
    });

  it('valida el cuerpo y rechaza los campos que no espera', async () => {
    expect((await enviar({ texto: 'hola' })).status).toBe(201);
    expect((await enviar({})).status).toBe(400);
    // Un campo de más, como un «role» colado en el registro, no se ignora.
    const conDeMas = await enviar({ texto: 'hola', role: 'admin' });
    expect(conDeMas.status).toBe(400);
    expect(await conDeMas.json()).toMatchObject({ statusCode: 400 });
  });

  it('no convierte los tipos: lo que no llega con el suyo se rechaza', async () => {
    // Con la conversión implícita, «false» entre comillas llegaba como
    // verdadero: completar una reserva con "sinCobro":"false" la cerraba sin
    // cobrar, y un registro con "aceptaTerminos":"false" contaba como
    // aceptado.
    const conBooleano = await enviar({ texto: 'hola', marcado: false });
    expect(conBooleano.status).toBe(201);
    expect(await conBooleano.json()).toEqual({ texto: 'hola', marcado: false });

    expect((await enviar({ texto: 'hola', marcado: 'false' })).status).toBe(
      400,
    );
    expect((await enviar({ texto: 'hola', marcado: 1 })).status).toBe(400);
    expect((await enviar({ texto: 'hola', cantidad: '3' })).status).toBe(400);
    expect((await enviar({ texto: 'hola', cantidad: true })).status).toBe(400);
    // Un objeto donde va un texto llegaba como «[object Object]».
    expect((await enviar({ texto: {} })).status).toBe(400);
  });
});
