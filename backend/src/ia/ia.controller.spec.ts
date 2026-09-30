import { IaController } from './ia.controller';

describe('IaController', () => {
  const presupuesto = {
    hayMargen: vi.fn(async () => true),
    costeMaximo: vi.fn(() => 7),
    resumen: vi.fn(),
  };
  const asistente = { responder: vi.fn() };
  const controlador = (disponible: boolean) =>
    new IaController(
      { disponible } as never,
      presupuesto as never,
      asistente as never,
    );

  beforeEach(() => vi.clearAllMocks());

  describe('estado', () => {
    it('sin proveedor está inactiva, y ni se mira el presupuesto', async () => {
      await expect(controlador(false).estado()).resolves.toEqual({
        disponible: false,
        motivo: 'inactiva',
      });
      expect(presupuesto.hayMargen).not.toHaveBeenCalled();
    });

    it('con margen para la llamada más cara posible, disponible', async () => {
      await expect(controlador(true).estado()).resolves.toEqual({
        disponible: true,
        motivo: null,
      });
      expect(presupuesto.hayMargen).toHaveBeenCalledWith(7);
    });

    it('sin margen, dice que es por el presupuesto', async () => {
      presupuesto.hayMargen.mockResolvedValueOnce(false);

      await expect(controlador(true).estado()).resolves.toEqual({
        disponible: false,
        motivo: 'presupuesto',
      });
    });
  });

  it('el consumo es el resumen del mes', async () => {
    await controlador(true).consumo();

    expect(presupuesto.resumen).toHaveBeenCalled();
  });

  it('el asistente recibe solo el mensaje', async () => {
    await controlador(true).asistenteBuscar({ mensaje: 'Un fontanero' });

    expect(asistente.responder).toHaveBeenCalledWith('Un fontanero');
  });
});
