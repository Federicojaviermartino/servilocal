import { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { taparCorreo, taparDatosPersonales } from './datos-personales';
import { SoloLecturaInterceptor } from './solo-lectura.interceptor';

const usuario = (id: string) => ({
  id,
  firstName: 'Laura',
  lastName: 'García',
  email: `${id}@correo.es`,
  phone: '611 222 333',
  address: 'Calle Real 5',
  postalCode: '29001',
  location: { type: 'Point', coordinates: [-4.42, 36.72] },
  city: 'Málaga',
  role: 'client',
  createdAt: new Date('2026-09-01T10:00:00Z'),
});

describe('los datos personales ante la administración de demostración', () => {
  it('tapa el correo, el contacto y la ubicación de cada persona', () => {
    // La cuenta se publica en la pantalla de acceso: sin esto, cualquier
    // visitante leía el correo, el teléfono y el domicilio de todo el que se
    // registrara de verdad.
    const [tapada] = taparDatosPersonales([usuario('u1')]) as Record<
      string,
      unknown
    >[];

    expect(tapada).toMatchObject({
      id: 'u1',
      firstName: 'Laura',
      lastName: 'G.',
      email: 'u•••@c•••',
      phone: '•••',
      address: '•••',
      postalCode: '•••',
      location: null,
      city: 'Málaga',
      role: 'client',
    });
    // Las fechas siguen siendo fechas, para que el panel las pinte.
    expect(tapada.createdAt).toBeInstanceOf(Date);
  });

  it('también dentro de otras cosas: las partes de una reserva', () => {
    const reserva = taparDatosPersonales({
      id: 'b1',
      client: usuario('c1'),
      provider: usuario('p1'),
    }) as Record<string, Record<string, unknown>>;

    expect(reserva.client.phone).toBe('•••');
    expect(reserva.provider.email).toBe('p•••@c•••');
  });

  it('y los correos del historial de moderación, en la fila y en su contexto', () => {
    const entrada = taparDatosPersonales({
      actorEmail: 'admin@servilocal.com',
      accion: 'usuario_desactivado',
      contexto: { email: 'victima@correo.es' },
    }) as Record<string, unknown>;

    expect(entrada.actorEmail).toBe('a•••@s•••');
    expect(entrada.contexto).toEqual({ email: 'v•••@c•••' });
  });

  it('la ubicación de un servicio no es de una persona: se deja', () => {
    const servicio = taparDatosPersonales({
      id: 's1',
      title: 'Fontanería',
      location: { type: 'Point', coordinates: [-3.7, 40.4] },
    }) as Record<string, unknown>;

    expect(servicio.location).toEqual({
      type: 'Point',
      coordinates: [-3.7, 40.4],
    });
  });

  it('lo del propio usuario de demostración se deja como está', () => {
    const propio = usuario('demo');

    expect(taparDatosPersonales(propio, 'demo')).toBe(propio);
  });

  it('no toca el original, que puede venir de una caché compartida', () => {
    const original = usuario('u1');

    taparDatosPersonales(original);

    expect(original.phone).toBe('611 222 333');
  });

  it('un texto sin arroba no es un correo', () => {
    expect(taparCorreo('sin-correo')).toBe('sin-correo');
    expect(taparCorreo(null)).toBeNull();
  });
});

describe('SoloLecturaInterceptor, al responder', () => {
  const contexto = (user: unknown) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ method: 'GET', user }) }),
    }) as unknown as ExecutionContext;
  const responde = (cuerpo: unknown): CallHandler => ({
    handle: () => of(cuerpo),
  });
  const interceptor = new SoloLecturaInterceptor();

  it('a la cuenta de demostración le llega tapado', async () => {
    const cuerpo = await lastValueFrom(
      interceptor.intercept(
        contexto({ id: 'demo', soloLectura: true }),
        responde([usuario('u1')]),
      ),
    );

    expect((cuerpo as Record<string, unknown>[])[0].phone).toBe('•••');
  });

  it('a cualquier otra cuenta, tal cual', async () => {
    const lista = [usuario('u1')];

    const cuerpo = await lastValueFrom(
      interceptor.intercept(
        contexto({ id: 'admin', soloLectura: false }),
        responde(lista),
      ),
    );

    expect(cuerpo).toBe(lista);
  });
});
