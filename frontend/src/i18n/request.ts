import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  const solicitado = await requestLocale;
  const idioma =
    solicitado && routing.locales.includes(solicitado as never)
      ? solicitado
      : routing.defaultLocale;

  return {
    locale: idioma,
    messages: (await import(`../../messages/${idioma}.json`)).default,
  };
});
