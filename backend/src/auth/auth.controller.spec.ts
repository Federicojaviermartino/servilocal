import type { NestExpressApplication } from '@nestjs/platform-express';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import { SesionRevocada, User, UserRole } from '../entities';
import { OrigenGuard } from '../common/guards/origen.guard';
import { SoloLecturaInterceptor } from '../common/interceptores/solo-lectura.interceptor';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SesionesService } from './sesiones.service';
import { JwtStrategy } from './strategies/jwt.strategy';

/**
 * La sesión por HTTP, de verdad: la aplicación escuchando en un puerto, la
 * estrategia de passport leyendo la cookie y los guardas globales puestos.
 *
 * Lo que se comprueba aquí son atributos de cabeceras —que la cookie sea
 * httpOnly, que el token no viaje en el cuerpo, qué borra el cierre de
 * sesión— y con dobles del controlador serían justo lo que no se ve.
 */
const SECRETO = 'secreto-de-prueba';
const FRONTEND = 'http://localhost:3000';
const CLAVE = 'Password123!';

let hash: string;
let soloLectura = false;

const usuarios = {
  findOne: vi.fn(async () => ({
    id: 'uuid-123',
    email: 'laura@ejemplo.com',
    firstName: 'Laura',
    lastName: 'Gómez',
    password: hash,
    role: UserRole.CLIENT,
    isActive: true,
    soloLectura,
  })),
};

/** La lista de sesiones cerradas, en memoria: lo que importa es qué entra. */
const cerradas = new Map<string, Date>();
const revocadas = {
  existsBy: vi.fn(async ({ jti }: { jti: string }) => cerradas.has(jti)),
  upsert: vi.fn(async ({ jti, caduca }: { jti: string; caduca: Date }) => {
    cerradas.set(jti, caduca);
  }),
  delete: vi.fn(async () => undefined),
};

let app: NestExpressApplication;
let base: string;
const jwt = new JwtService({ secret: SECRETO });

beforeAll(async () => {
  vi.stubEnv('CORS_ORIGINS', FRONTEND);
  hash = await bcrypt.hash(CLAVE, 4);

  const modulo = await Test.createTestingModule({
    imports: [
      PassportModule,
      JwtModule.register({
        secret: SECRETO,
        signOptions: { expiresIn: '24h' },
      }),
    ],
    controllers: [AuthController],
    providers: [
      AuthService,
      JwtStrategy,
      SesionesService,
      { provide: getRepositoryToken(User), useValue: usuarios },
      { provide: getRepositoryToken(SesionRevocada), useValue: revocadas },
      {
        provide: ConfigService,
        useValue: { get: () => SECRETO, getOrThrow: () => SECRETO },
      },
      { provide: APP_GUARD, useClass: OrigenGuard },
      { provide: APP_INTERCEPTOR, useClass: SoloLecturaInterceptor },
    ],
  }).compile();

  app = modulo.createNestApplication<NestExpressApplication>();
  // Como en main.ts: sin esto, X-Forwarded-Proto no cuenta.
  app.set('trust proxy', 1);
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  await app.listen(0, '127.0.0.1');
  base = `${(await app.getUrl()).replace('[::1]', '127.0.0.1')}/api`;
});

afterAll(async () => {
  await app?.close();
  vi.unstubAllEnvs();
});

beforeEach(() => {
  soloLectura = false;
  vi.stubEnv('NODE_ENV', 'test');
});

function pedir(ruta: string, init: RequestInit = {}) {
  return fetch(`${base}${ruta}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init.headers },
  });
}

const credenciales = JSON.stringify({
  email: 'laura@ejemplo.com',
  password: CLAVE,
});

/** Entra y devuelve la cookie tal como la mandaría el navegador. */
async function entrar(): Promise<string> {
  const respuesta = await pedir('/auth/login', {
    method: 'POST',
    body: credenciales,
  });
  const [cookie] = respuesta.headers.getSetCookie();
  return cookie.split(';')[0];
}

describe('Sesión en cookie', () => {
  describe('al entrar', () => {
    it('pone la cookie httpOnly, Lax y para todo el sitio', async () => {
      const respuesta = await pedir('/auth/login', {
        method: 'POST',
        body: credenciales,
      });

      expect(respuesta.status).toBe(200);
      const [cookie] = respuesta.headers.getSetCookie();
      expect(cookie).toMatch(/^sesion=[\w-]+\.[\w-]+\.[\w-]+;/);
      expect(cookie).toMatch(/; HttpOnly/i);
      expect(cookie).toMatch(/; SameSite=Lax/i);
      expect(cookie).toMatch(/; Path=\//);
      expect(cookie).toMatch(/; Expires=/);
      // Sin Domain: así la cookie es solo del frontend, que es quien la
      // recibe al reenviar la respuesta, y no de todos sus subdominios.
      expect(cookie).not.toMatch(/Domain=/i);
    });

    it('no devuelve el token en el cuerpo', async () => {
      // Si viajara también en el cuerpo, JavaScript lo leería al entrar y la
      // cookie no protegería de nada.
      const respuesta = await pedir('/auth/login', {
        method: 'POST',
        body: credenciales,
      });
      const cuerpo = await respuesta.json();

      expect(cuerpo).toEqual({
        user: expect.objectContaining({ email: 'laura@ejemplo.com' }),
      });
      expect(JSON.stringify(cuerpo)).not.toMatch(/eyJ/);
    });

    it('si la petición llegó por https, la cookie solo viaja por https', async () => {
      // En producción es siempre así: Render lo dice en X-Forwarded-Proto.
      const respuesta = await pedir('/auth/login', {
        method: 'POST',
        body: credenciales,
        headers: { 'x-forwarded-proto': 'https' },
      });

      expect(respuesta.headers.getSetCookie()[0]).toMatch(/; Secure/i);
    });

    it('por http no la marca como segura, aunque sea producción', async () => {
      // Safari guarda una cookie segura recibida por http://localhost y
      // luego no la manda: la integración continua corre en producción
      // sobre http, y ahí todo lo que pide sesión fallaba en WebKit.
      vi.stubEnv('NODE_ENV', 'production');

      const respuesta = await pedir('/auth/login', {
        method: 'POST',
        body: credenciales,
      });

      expect(respuesta.headers.getSetCookie()[0]).not.toMatch(/Secure/i);
    });

    it('el registro también abre la sesión en la cookie', async () => {
      usuarios.findOne.mockResolvedValueOnce(null as never);
      const repo = usuarios as unknown as Record<string, unknown>;
      repo.create = vi.fn((datos: object) => datos);
      repo.save = vi.fn(async (datos: object) => ({
        id: 'uuid-nuevo',
        ...datos,
      }));

      const respuesta = await pedir('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          firstName: 'Ana',
          lastName: 'Ruiz',
          email: 'ana@ejemplo.com',
          password: CLAVE,
          role: UserRole.CLIENT,
        }),
      });

      expect(respuesta.status).toBe(201);
      expect(respuesta.headers.getSetCookie()[0]).toMatch(
        /^sesion=.+HttpOnly/i,
      );
      expect(Object.keys(await respuesta.json())).toEqual(['user']);
    });
  });

  describe('con la cookie', () => {
    it('la API reconoce a quien la trae', async () => {
      const cookie = await entrar();

      const respuesta = await pedir('/auth/profile', { headers: { cookie } });

      expect(respuesta.status).toBe(200);
      expect((await respuesta.json()).email).toBe('laura@ejemplo.com');
    });

    it('sin ella, no', async () => {
      const respuesta = await pedir('/auth/profile');

      expect(respuesta.status).toBe(401);
    });

    it('un token sin identificador de sesión no vale', async () => {
      // No se podría cerrar desde el servidor.
      const sinIdentificador = jwt.sign(
        { sub: 'uuid-123', email: 'laura@ejemplo.com', role: 'client' },
        { audience: 'servilocal-api', expiresIn: '1h' },
      );

      const respuesta = await pedir('/auth/profile', {
        headers: { cookie: `sesion=${sinIdentificador}` },
      });

      expect(respuesta.status).toBe(401);
    });

    it('una sesión de antes del cambio, sin audiencia, ya no vale', async () => {
      // Los tokens emitidos antes no llevan audiencia. Tras desplegar, todo
      // el mundo vuelve a entrar una vez.
      const antiguo = jwt.sign(
        { sub: 'uuid-123', email: 'laura@ejemplo.com', role: 'client' },
        { expiresIn: '1h' },
      );

      const respuesta = await pedir('/auth/profile', {
        headers: { cookie: `sesion=${antiguo}` },
      });

      expect(respuesta.status).toBe(401);
    });
  });

  describe('POST /auth/token', () => {
    it('da el token en el cuerpo y no pone cookie', async () => {
      const respuesta = await pedir('/auth/token', {
        method: 'POST',
        body: credenciales,
      });
      const { accessToken } = await respuesta.json();

      expect(respuesta.status).toBe(200);
      expect(respuesta.headers.getSetCookie()).toEqual([]);

      const perfil = await pedir('/auth/profile', {
        headers: { authorization: `Bearer ${accessToken}` },
      });
      expect(perfil.status).toBe(200);
    });
  });

  describe('pase del socket', () => {
    it('se da a quien tiene sesión, y sin caché', async () => {
      const cookie = await entrar();

      const respuesta = await pedir('/auth/socket-ticket', {
        headers: { cookie },
      });

      expect(respuesta.status).toBe(200);
      expect(respuesta.headers.get('cache-control')).toBe('no-store');
      expect((await respuesta.json()).ticket).toMatch(/^eyJ/);
    });

    it('también a una cuenta de demostración', async () => {
      // Las de demostración no pueden hacer POST. Por eso el pase es un GET:
      // si no, se quedarían sin avisos en vivo.
      soloLectura = true;
      const cookie = await entrar();

      const respuesta = await pedir('/auth/socket-ticket', {
        headers: { cookie },
      });

      expect(respuesta.status).toBe(200);
    });

    it('no sirve para entrar en la API, ni en la cabecera ni en la cookie', async () => {
      const cookie = await entrar();
      const { ticket } = await (
        await pedir('/auth/socket-ticket', { headers: { cookie } })
      ).json();

      const comoCabecera = await pedir('/auth/profile', {
        headers: { authorization: `Bearer ${ticket}` },
      });
      const comoCookie = await pedir('/auth/profile', {
        headers: { cookie: `sesion=${ticket}` },
      });

      expect(comoCabecera.status).toBe(401);
      expect(comoCookie.status).toBe(401);
    });

    it('sin sesión no hay pase', async () => {
      const respuesta = await pedir('/auth/socket-ticket');

      expect(respuesta.status).toBe(401);
    });
  });

  describe('al salir', () => {
    it('borra la cookie con los mismos atributos con que se puso', async () => {
      const respuesta = await pedir('/auth/logout', { method: 'POST' });

      expect(respuesta.status).toBe(204);
      const [cookie] = respuesta.headers.getSetCookie();
      expect(cookie).toMatch(/^sesion=;/);
      expect(cookie).toMatch(/Expires=Thu, 01 Jan 1970/);
      expect(cookie).toMatch(/; Path=\//);
      expect(cookie).toMatch(/; HttpOnly/i);
    });

    it('funciona aunque la sesión ya haya caducado', async () => {
      const respuesta = await pedir('/auth/logout', {
        method: 'POST',
        headers: { cookie: 'sesion=caducada' },
      });

      expect(respuesta.status).toBe(204);
    });

    it('el token deja de valer aunque alguien lo hubiera copiado', async () => {
      // Borrar la cookie solo cierra este navegador. Sin apuntar la sesión
      // en el servidor, una copia del token seguía entrando hasta caducar.
      const cookie = await entrar();
      const token = cookie.slice('sesion='.length);

      await pedir('/auth/logout', { method: 'POST', headers: { cookie } });

      const comoCookie = await pedir('/auth/profile', { headers: { cookie } });
      const comoCabecera = await pedir('/auth/profile', {
        headers: { authorization: `Bearer ${token}` },
      });
      expect(comoCookie.status).toBe(401);
      expect(comoCabecera.status).toBe(401);
    });

    it('ni sirve para pedir un pase del socket', async () => {
      const cookie = await entrar();

      await pedir('/auth/logout', { method: 'POST', headers: { cookie } });

      const pase = await pedir('/auth/socket-ticket', { headers: { cookie } });
      expect(pase.status).toBe(401);
    });

    it('las demás sesiones de la misma cuenta siguen abiertas', async () => {
      // Las cuentas de demostración las usan muchos a la vez: que uno salga
      // no puede echar a los demás.
      const mia = await entrar();
      const deOtro = await entrar();

      await pedir('/auth/logout', { method: 'POST', headers: { cookie: mia } });

      const respuesta = await pedir('/auth/profile', {
        headers: { cookie: deOtro },
      });
      expect(respuesta.status).toBe(200);
    });

    it('también cierra un token de /auth/token enviado como Bearer', async () => {
      const { accessToken } = await (
        await pedir('/auth/token', { method: 'POST', body: credenciales })
      ).json();
      const cabecera = { authorization: `Bearer ${accessToken}` };

      await pedir('/auth/logout', { method: 'POST', headers: cabecera });

      const respuesta = await pedir('/auth/profile', { headers: cabecera });
      expect(respuesta.status).toBe(401);
    });

    it('lo que no es un token válido no se apunta', async () => {
      // Si se apuntara lo que llegue, cualquiera podría llenar la tabla.
      revocadas.upsert.mockClear();

      await pedir('/auth/logout', {
        method: 'POST',
        headers: { cookie: 'sesion=basura', authorization: 'Bearer basura' },
      });

      expect(revocadas.upsert).not.toHaveBeenCalled();
    });
  });

  describe('origen de las peticiones que cambian algo', () => {
    it('acepta el del frontend', async () => {
      const respuesta = await pedir('/auth/login', {
        method: 'POST',
        body: credenciales,
        headers: { origin: FRONTEND },
      });

      expect(respuesta.status).toBe(200);
    });

    it('rechaza el de otra web, aunque la contraseña sea buena', async () => {
      // Es el ataque que CORS no para: otra web envía un formulario de
      // acceso y mete al visitante en una cuenta que controla ella.
      const respuesta = await pedir('/auth/login', {
        method: 'POST',
        body: credenciales,
        headers: { origin: 'https://otra-web.onrender.com' },
      });

      expect(respuesta.status).toBe(403);
      expect(respuesta.headers.getSetCookie()).toEqual([]);
    });

    it('rechaza el origen opaco que mandan los marcos aislados', async () => {
      const respuesta = await pedir('/auth/logout', {
        method: 'POST',
        headers: { origin: 'null' },
      });

      expect(respuesta.status).toBe(403);
    });

    it('acepta lo que no viene de un navegador', async () => {
      // curl, los scripts, el aviso de Stripe: sin Origin y sin cookie ajena.
      const respuesta = await pedir('/auth/logout', { method: 'POST' });

      expect(respuesta.status).toBe(204);
    });

    it('acepta a Swagger, que se sirve desde la propia API', async () => {
      const respuesta = await pedir('/auth/logout', {
        method: 'POST',
        headers: {
          origin: base.replace(/\/api$/, ''),
          'sec-fetch-site': 'same-origin',
        },
      });

      expect(respuesta.status).toBe(204);
    });

    it('no mira el origen en las lecturas', async () => {
      const cookie = await entrar();

      const respuesta = await pedir('/auth/profile', {
        headers: { cookie, origin: 'https://otra-web.onrender.com' },
      });

      expect(respuesta.status).toBe(200);
    });
  });
});
