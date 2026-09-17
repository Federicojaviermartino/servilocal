import { NotFoundException } from '@nestjs/common';
import type { Request } from 'express';
import { DiagnosticoController } from './diagnostico.controller';

function peticion(): Request {
  return {
    headers: {
      'x-forwarded-for': '9.9.9.9, 10.0.0.1',
      'cf-connecting-ip': '9.9.9.9',
    },
    socket: { remoteAddress: '10.0.0.2' },
    ip: '10.0.0.1',
    ips: ['9.9.9.9', '10.0.0.1'],
    app: { get: () => 1 },
  } as unknown as Request;
}

describe('DiagnosticoController', () => {
  const controlador = new DiagnosticoController();
  const original = process.env.DIAGNOSTICO_TOKEN;

  afterEach(() => {
    if (original === undefined) delete process.env.DIAGNOSTICO_TOKEN;
    else process.env.DIAGNOSTICO_TOKEN = original;
  });

  it('no existe si no se ha configurado el testigo', () => {
    delete process.env.DIAGNOSTICO_TOKEN;

    // 404 y no 401: un 401 anunciaría que aquí hay algo apagado.
    expect(() => controlador.ip(peticion(), 'lo-que-sea')).toThrow(
      NotFoundException,
    );
  });

  it('no existe tampoco sin cabecera, con el testigo puesto', () => {
    process.env.DIAGNOSTICO_TOKEN = 'secreto';

    expect(() => controlador.ip(peticion(), undefined)).toThrow(
      NotFoundException,
    );
  });

  it('rechaza un testigo que no coincide', () => {
    process.env.DIAGNOSTICO_TOKEN = 'secreto';

    expect(() => controlador.ip(peticion(), 'otro')).toThrow(NotFoundException);
  });

  it('con el testigo correcto devuelve lo que hace falta para medir', () => {
    process.env.DIAGNOSTICO_TOKEN = 'secreto';

    const r = controlador.ip(peticion(), 'secreto');

    // Las dos que responden a las preguntas abiertas: cuántos saltos hay
    // delante y qué está usando hoy el limitador como clave.
    expect(r.xForwardedFor).toBe('9.9.9.9, 10.0.0.1');
    expect(r.reqIp).toBe('10.0.0.1');
    expect(r.trustProxy).toBe(1);
    expect(r.cfConnectingIp).toBe('9.9.9.9');
  });

  it('devuelve null en las cabeceras que no lleguen, sin inventarlas', () => {
    process.env.DIAGNOSTICO_TOKEN = 'secreto';

    const r = controlador.ip(peticion(), 'secreto');

    expect(r.trueClientIp).toBeNull();
    expect(r.xRealIp).toBeNull();
  });
});
