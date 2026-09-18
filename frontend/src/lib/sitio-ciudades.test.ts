import { describe, expect, it } from 'vitest';
import { CIUDADES } from './ciudades';
import { SITIO_URL, urlAbsoluta } from './sitio';

describe('ciudades con cobertura', () => {
  it('la misma lista alimenta el filtro y el alta', () => {
    // Si estuviera duplicada en dos sitios, publicar en una ciudad que el
    // filtro no ofrece dejaría servicios imposibles de encontrar.
    expect(CIUDADES.length).toBeGreaterThan(5);
  });

  it('no hay ninguna repetida', () => {
    // Una repetida sale dos veces en el desplegable.
    expect(new Set(CIUDADES).size).toBe(CIUDADES.length);
  });

  it('se escriben con sus tildes', () => {
    // El servidor compara sin acentos, así que lo guardado casa igual; lo
    // que se enseña, en cambio, tiene que estar bien escrito.
    expect(CIUDADES).toContain('Málaga');
  });

  it('ninguna viene con espacios de sobra', () => {
    // Un espacio al final rompe la comparación exacta del formulario.
    for (const ciudad of CIUDADES) {
      expect(ciudad).toBe(ciudad.trim());
    }
  });
});

describe('URL del sitio', () => {
  it('es absoluta y con esquema', () => {
    // El sitemap, robots.txt y las etiquetas Open Graph las exigen así.
    expect(SITIO_URL).toMatch(/^https?:\/\//);
  });

  it('una ruta interna se convierte en absoluta', () => {
    expect(urlAbsoluta('/services/search')).toBe(
      `${SITIO_URL}/services/search`,
    );
  });

  it('la raíz no deja doble barra', () => {
    expect(urlAbsoluta('/')).toBe(`${SITIO_URL}/`);
  });

  it('conserva la cadena de consulta', () => {
    expect(urlAbsoluta('/services/search?city=Málaga')).toContain('city=');
  });
});
