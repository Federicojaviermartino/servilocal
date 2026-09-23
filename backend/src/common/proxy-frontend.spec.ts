import {
  CABECERA_SECRETO_PROXY,
  CABECERA_VISITANTE_PROXY,
  secretoDelProxy,
  visitanteReenviado,
} from './proxy-frontend';

const SECRETO = 'a'.repeat(32);
const VISITANTE = '150.228.101.176';

afterEach(() => vi.unstubAllEnvs());

describe('secretoDelProxy', () => {
  it('sin variable no hay secreto', () => {
    vi.stubEnv('PROXY_SECRETO', '');

    expect(secretoDelProxy()).toBeNull();
  });

  it('uno corto se ignora: se podría adivinar probando', () => {
    vi.stubEnv('PROXY_SECRETO', 'a'.repeat(31));

    expect(secretoDelProxy()).toBeNull();
  });

  it('no cuenta los espacios de alrededor, que se cuelan al pegarlo', () => {
    vi.stubEnv('PROXY_SECRETO', `  ${SECRETO}\n`);

    expect(secretoDelProxy()).toBe(SECRETO);
  });
});

describe('visitanteReenviado', () => {
  beforeEach(() => vi.stubEnv('PROXY_SECRETO', SECRETO));

  it('con el secreto bueno, la dirección que manda el frontend', () => {
    expect(
      visitanteReenviado({
        [CABECERA_SECRETO_PROXY]: SECRETO,
        [CABECERA_VISITANTE_PROXY]: VISITANTE,
      }),
    ).toBe(VISITANTE);
  });

  it('con otro secreto, nada: cualquiera puede mandar la cabecera', () => {
    expect(
      visitanteReenviado({
        [CABECERA_SECRETO_PROXY]: 'b'.repeat(32),
        [CABECERA_VISITANTE_PROXY]: VISITANTE,
      }),
    ).toBeNull();
  });

  it('con un secreto que solo empieza igual, tampoco', () => {
    expect(
      visitanteReenviado({
        [CABECERA_SECRETO_PROXY]: SECRETO.slice(0, 16),
        [CABECERA_VISITANTE_PROXY]: VISITANTE,
      }),
    ).toBeNull();
  });

  it('sin secreto, nada', () => {
    expect(
      visitanteReenviado({ [CABECERA_VISITANTE_PROXY]: VISITANTE }),
    ).toBeNull();
  });

  it('con el secreto pero sin dirección, nada', () => {
    expect(
      visitanteReenviado({
        [CABECERA_SECRETO_PROXY]: SECRETO,
        [CABECERA_VISITANTE_PROXY]: '  ',
      }),
    ).toBeNull();
  });

  it('si la API no tiene secreto, no cree a nadie', () => {
    // Sin secreto configurado, cualquiera que mande las dos cabeceras podría
    // elegir su propio contador.
    vi.stubEnv('PROXY_SECRETO', '');

    expect(
      visitanteReenviado({
        [CABECERA_SECRETO_PROXY]: '',
        [CABECERA_VISITANTE_PROXY]: VISITANTE,
      }),
    ).toBeNull();
  });

  it('toma la primera si llegan repetidas', () => {
    expect(
      visitanteReenviado({
        [CABECERA_SECRETO_PROXY]: [SECRETO, 'otro'],
        [CABECERA_VISITANTE_PROXY]: [VISITANTE, '8.8.8.8'],
      }),
    ).toBe(VISITANTE);
  });
});
