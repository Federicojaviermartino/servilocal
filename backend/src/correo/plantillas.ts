import type { Correo } from './correo.service';

/** Los idiomas de la interfaz. El correo sale en el que la persona usaba. */
export const IDIOMAS = [
  'es',
  'en',
  'ca',
  'gl',
  'eu',
  'fr',
  'de',
  'it',
  'pt',
  'ar',
] as const;
export type Idioma = (typeof IDIOMAS)[number];

export const esIdioma = (valor: unknown): valor is Idioma =>
  typeof valor === 'string' && (IDIOMAS as readonly string[]).includes(valor);

interface TextosRecuperacion {
  asunto: string;
  saludo: string;
  cuerpo: string;
  boton: string;
  ignorar: string;
}

/**
 * El correo para elegir contraseña nueva.
 *
 * Dice lo justo: quién lo manda, qué hacer, cuánto dura el enlace y que no
 * pasa nada si no lo pidió uno mismo. Nada de datos de la cuenta: un correo
 * reenviado o leído por encima del hombro no debe contar más que eso.
 *
 * Tampoco el nombre. El correo no se verifica al registrarse, así que el
 * nombre lo pudo escribir otra persona con la dirección de alguien que no
 * tenía cuenta: iba en el saludo de un correo auténtico de ServiLocal, con
 * cien caracteres para lo que quisiera, y llegaba a quien no lo pidió.
 */
const RECUPERACION: Record<Idioma, TextosRecuperacion> = {
  es: {
    asunto: 'Elige una contraseña nueva en ServiLocal',
    saludo: 'Hola:',
    cuerpo:
      'Hemos recibido una petición para cambiar la contraseña de tu cuenta de ServiLocal. Para elegir una nueva, abre este enlace durante la próxima hora:',
    boton: 'Elegir contraseña nueva',
    ignorar:
      'Si no lo has pedido tú, no hagas nada: tu contraseña sigue siendo la misma.',
  },
  en: {
    asunto: 'Choose a new password on ServiLocal',
    saludo: 'Hi,',
    cuerpo:
      'We received a request to change the password of your ServiLocal account. To choose a new one, open this link within the next hour:',
    boton: 'Choose a new password',
    ignorar:
      'If you did not ask for this, do nothing: your password stays the same.',
  },
  ca: {
    asunto: 'Tria una contrasenya nova a ServiLocal',
    saludo: 'Hola:',
    cuerpo:
      'Hem rebut una petició per canviar la contrasenya del teu compte de ServiLocal. Per triar-ne una de nova, obre aquest enllaç durant la pròxima hora:',
    boton: 'Tria una contrasenya nova',
    ignorar:
      'Si no ho has demanat tu, no facis res: la teva contrasenya continua sent la mateixa.',
  },
  gl: {
    asunto: 'Escolle un contrasinal novo en ServiLocal',
    saludo: 'Ola:',
    cuerpo:
      'Recibimos unha petición para cambiar o contrasinal da túa conta de ServiLocal. Para escoller un novo, abre esta ligazón durante a próxima hora:',
    boton: 'Escoller contrasinal novo',
    ignorar:
      'Se non o pediches ti, non fagas nada: o teu contrasinal segue sendo o mesmo.',
  },
  eu: {
    asunto: 'Aukeratu pasahitz berri bat ServiLocal-en',
    saludo: 'Kaixo:',
    cuerpo:
      'Zure ServiLocal kontuaren pasahitza aldatzeko eskaera bat jaso dugu. Berri bat aukeratzeko, ireki esteka hau datorren orduan:',
    boton: 'Aukeratu pasahitz berria',
    ignorar:
      'Zuk eskatu ez baduzu, ez egin ezer: zure pasahitza berbera da oraindik.',
  },
  fr: {
    asunto: 'Choisissez un nouveau mot de passe sur ServiLocal',
    saludo: 'Bonjour,',
    cuerpo:
      'Nous avons reçu une demande de changement du mot de passe de votre compte ServiLocal. Pour en choisir un nouveau, ouvrez ce lien dans l’heure qui vient :',
    boton: 'Choisir un nouveau mot de passe',
    ignorar:
      'Si vous n’êtes pas à l’origine de cette demande, ne faites rien : votre mot de passe reste le même.',
  },
  de: {
    asunto: 'Wählen Sie ein neues Passwort für ServiLocal',
    saludo: 'Hallo,',
    cuerpo:
      'Wir haben eine Anfrage erhalten, das Passwort Ihres ServiLocal-Kontos zu ändern. Um ein neues zu wählen, öffnen Sie diesen Link innerhalb der nächsten Stunde:',
    boton: 'Neues Passwort wählen',
    ignorar:
      'Wenn Sie das nicht angefordert haben, tun Sie nichts: Ihr Passwort bleibt unverändert.',
  },
  it: {
    asunto: 'Scegli una nuova password su ServiLocal',
    saludo: 'Ciao,',
    cuerpo:
      'Abbiamo ricevuto una richiesta di modifica della password del tuo account ServiLocal. Per sceglierne una nuova, apri questo link entro la prossima ora:',
    boton: 'Scegli una nuova password',
    ignorar:
      'Se non l’hai richiesto tu, non fare nulla: la tua password resta la stessa.',
  },
  pt: {
    asunto: 'Escolha uma nova palavra-passe no ServiLocal',
    saludo: 'Olá:',
    cuerpo:
      'Recebemos um pedido para alterar a palavra-passe da sua conta ServiLocal. Para escolher uma nova, abra esta ligação durante a próxima hora:',
    boton: 'Escolher nova palavra-passe',
    ignorar:
      'Se não foi você a pedir, não faça nada: a sua palavra-passe continua a mesma.',
  },
  ar: {
    asunto: 'اختر كلمة مرور جديدة في ServiLocal',
    saludo: 'مرحبًا،',
    cuerpo:
      'تلقّينا طلبًا لتغيير كلمة مرور حسابك في ServiLocal. لاختيار كلمة مرور جديدة، افتح هذا الرابط خلال الساعة القادمة:',
    boton: 'اختر كلمة مرور جديدة',
    ignorar: 'إذا لم تطلب ذلك، فلا تفعل شيئًا: تبقى كلمة مرورك كما هي.',
  },
};

/** Lo que se pinta en HTML, sin que se interprete. */
function escapar(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function correoDeRecuperacion(
  idioma: Idioma,
  para: { email: string },
  enlace: string,
): Correo {
  const t = RECUPERACION[idioma];
  const direccion = idioma === 'ar' ? 'rtl' : 'ltr';

  return {
    para,
    asunto: t.asunto,
    texto: [t.saludo, '', t.cuerpo, '', enlace, '', t.ignorar].join('\n'),
    html: `<!doctype html>
<html lang="${idioma}" dir="${direccion}">
  <body style="font-family: system-ui, sans-serif; line-height: 1.5; color: #1f2937;">
    <p>${escapar(t.saludo)}</p>
    <p>${escapar(t.cuerpo)}</p>
    <p><a href="${escapar(enlace)}" style="display: inline-block; padding: 10px 16px; background: #2563eb; color: #ffffff; border-radius: 6px; text-decoration: none;">${escapar(t.boton)}</a></p>
    <p style="font-size: 14px; color: #4b5563;">${escapar(enlace)}</p>
    <p style="font-size: 14px; color: #4b5563;">${escapar(t.ignorar)}</p>
  </body>
</html>`,
  };
}
