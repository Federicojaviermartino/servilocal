import { Client } from 'pg';
import { conexionPorUrl } from './conexion-segura';

/** El TLS con el que se conectaría node-postgres de verdad. */
function tlsEfectivo(url: string, ssl: unknown): unknown {
  return (
    new Client({ connectionString: url, ssl } as never) as unknown as {
      connectionParameters: { ssl: unknown };
    }
  ).connectionParameters.ssl;
}

const BASE = 'postgresql://usuario:clave@servidor.neon.tech:5432/basededatos';

describe('conexionPorUrl', () => {
  it('con la URL tal cual, lo que diga la URL pisa lo que pide el código', () => {
    // Es el problema que esto resuelve, reproducido con node-postgres: el
    // código pide verificar el certificado y la URL dice que no. Gana la
    // URL. Sin esta prueba, la siguiente no demostraría nada.
    expect(
      tlsEfectivo(`${BASE}?sslmode=no-verify`, { rejectUnauthorized: true }),
    ).toEqual({ rejectUnauthorized: false });
  });

  it('con la URL limpia, decide el código', () => {
    const conexion = conexionPorUrl(`${BASE}?sslmode=no-verify`, false);

    expect(tlsEfectivo(conexion.url, conexion.ssl)).toEqual({
      rejectUnauthorized: true,
    });
  });

  it('también con la sslmode=require que trae Neon', () => {
    // Hoy require verifica, pero pg ya avisa de que en su próxima versión
    // mayor dejará de hacerlo. Con esto da igual lo que acabe significando.
    const conexion = conexionPorUrl(`${BASE}?sslmode=require`, false);

    expect(conexion.url).toBe(BASE);
    expect(tlsEfectivo(conexion.url, conexion.ssl)).toEqual({
      rejectUnauthorized: true,
    });
  });

  it('DB_SSL_PERMISIVO sigue desactivando la verificación', () => {
    // Para proveedores con certificado autofirmado. Es una decisión
    // explícita del entorno, no algo que se cuele por la URL.
    expect(conexionPorUrl(`${BASE}?sslmode=require`, true).ssl).toEqual({
      rejectUnauthorized: false,
    });
  });

  it('quita todo lo que node-postgres convierte en TLS', () => {
    // Cualquiera de estos hace que la URL construya su propio objeto de TLS
    // y pise el del código.
    const conexion = conexionPorUrl(
      `${BASE}?ssl=true&sslmode=verify-ca&sslrootcert=/tmp/ca.pem&sslcert=c&sslkey=k&uselibpqcompat=true`,
      false,
    );

    expect(conexion.url).toBe(BASE);
  });

  it('respeta sslmode=disable, que no dice cuánto verificar sino si hay TLS', () => {
    // Solo tiene sentido contra una base local sin TLS, y ahí forzarlo
    // impediría conectar.
    const conexion = conexionPorUrl(
      'postgresql://u:p@localhost:5432/db?sslmode=disable',
      false,
    );

    expect(conexion.ssl).toBe(false);
    expect(conexion.url).toBe('postgresql://u:p@localhost:5432/db');
  });

  it('deja en paz los parámetros que no son de TLS', () => {
    const conexion = conexionPorUrl(
      `${BASE}?sslmode=require&application_name=servilocal&options=-c%20statement_timeout%3D5000`,
      false,
    );

    expect(conexion.url).toBe(
      `${BASE}?application_name=servilocal&options=-c+statement_timeout%3D5000`,
    );
    // Y node-postgres los sigue leyendo igual.
    const leida = new Client({
      connectionString: conexion.url,
    } as never) as unknown as {
      connectionParameters: { application_name: string; options: string };
    };
    expect(leida.connectionParameters.application_name).toBe('servilocal');
    expect(leida.connectionParameters.options).toBe(
      '-c statement_timeout=5000',
    );
  });

  it('no toca usuario ni contraseña, aunque la contraseña lleve de todo', () => {
    // Reescribir la parte de las credenciales podría volver a codificar una
    // contraseña con caracteres especiales y romper una conexión que
    // funcionaba. Se comprueba byte a byte.
    const credenciales =
      'postgresql://neondb_owner:p%40ss%23w0rd%21%24%26@ep-x.neon.tech/neondb';
    const conexion = conexionPorUrl(`${credenciales}?sslmode=require`, false);

    expect(conexion.url).toBe(credenciales);
    const leida = new Client({
      connectionString: conexion.url,
    } as never) as unknown as {
      connectionParameters: { password: string };
    };
    expect(leida.connectionParameters.password).toBe('p@ss#w0rd!$&');
  });

  it('una URL sin parámetros sale igual', () => {
    expect(conexionPorUrl(BASE, false)).toEqual({
      url: BASE,
      ssl: { rejectUnauthorized: true },
    });
  });
});
