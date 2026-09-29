import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ReplyMessageDto, SendMessageDto } from './message.dto';

const DESTINATARIO = '8f14e45f-ceea-467a-9575-6d2c1b1f0a11';

async function rechazadas(
  clase: new () => object,
  datos: Record<string, unknown>,
): Promise<string[]> {
  const errores = await validate(plainToInstance(clase, datos));
  return errores.map((error) => error.property);
}

describe('Un mensaje', () => {
  it('admite hasta 2000 caracteres', async () => {
    expect(
      await rechazadas(SendMessageDto, {
        receiverId: DESTINATARIO,
        content: 'a'.repeat(2000),
      }),
    ).toEqual([]);
  });

  it('más no, ni al escribir ni al responder', async () => {
    const largo = 'a'.repeat(2001);

    expect(
      await rechazadas(SendMessageDto, {
        receiverId: DESTINATARIO,
        content: largo,
      }),
    ).toEqual(['content']);
    expect(await rechazadas(ReplyMessageDto, { content: largo })).toEqual([
      'content',
    ]);
  });

  it('vacío, tampoco', async () => {
    expect(await rechazadas(ReplyMessageDto, { content: '' })).toEqual([
      'content',
    ]);
  });

  it('el destinatario tiene que ser un identificador: «abc» llegaba a la base y daba 500', async () => {
    expect(
      await rechazadas(SendMessageDto, { receiverId: 'abc', content: 'Hola' }),
    ).toEqual(['receiverId']);
  });
});
