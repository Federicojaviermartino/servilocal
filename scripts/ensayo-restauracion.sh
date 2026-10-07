#!/usr/bin/env bash
# Ensayo de la copia de la base y de su restauración, de principio a fin.
#
# Uso: URL_BASE=postgresql://…/origen URL_DESTINO=postgresql://…/vacia \
#        scripts/ensayo-restauracion.sh
#
# Una copia que nunca se ha restaurado no se sabe si sirve. Esto hace con una
# base de verdad lo que docs/OPERATIONS.md manda hacer el día que haga falta
# —copiar y cifrar con copia-base.sh, descifrar y restaurar en una base
# vacía— y comprueba que al otro lado está todo: las mismas filas con el
# mismo contenido, y lo que no son datos pero sin lo que la aplicación no es
# la misma, que son las extensiones, las restricciones, los índices y las
# secuencias.
#
# La clave se genera aquí y se borra al acabar: se ensaya el procedimiento,
# no la clave de las copias de verdad.
set -euo pipefail

: "${URL_BASE:?Falta URL_BASE, la base que se copia}"
: "${URL_DESTINO:?Falta URL_DESTINO, una base vacía en la que restaurar}"

trabajo=$(mktemp -d)
trap 'rm -rf "$trabajo"' EXIT

age-keygen -o "$trabajo/clave.txt" 2>/dev/null
DESTINATARIO=$(age-keygen -y "$trabajo/clave.txt")
export DESTINATARIO

bash "$(dirname "$0")/copia-base.sh" "$trabajo/copia.dump.age"

# Lo que se sube es ilegible sin la clave privada.
if pg_restore --list "$trabajo/copia.dump.age" >/dev/null 2>&1; then
  echo "La copia se puede leer sin descifrar." >&2
  exit 1
fi

# Como en docs/OPERATIONS.md, y además sin perdonar ni un error: en una base
# vacía no tiene por qué haber ninguno.
age --decrypt --identity "$trabajo/clave.txt" "$trabajo/copia.dump.age" \
  | pg_restore --no-owner --no-privileges --exit-on-error --dbname="$URL_DESTINO"

# Un retrato de la base en texto: una línea por cosa, en orden, para que dos
# bases iguales den dos textos iguales. De cada tabla, cuántas filas tiene y
# la huella de todas ellas.
retrato() {
  psql --no-psqlrc --tuples-only --no-align --set ON_ERROR_STOP=1 --dbname="$1" <<'SQL'
SELECT 'extensión ' || extname FROM pg_extension ORDER BY 1;

SELECT format(
  'SELECT %L || count(*) || %L || coalesce(md5(string_agg(t::text, %L ORDER BY t::text)), %L) FROM public.%I t',
  'tabla ' || relname || ': ', ' filas, huella ', '', 'ninguna', relname)
FROM pg_class
WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'
ORDER BY relname
\gexec

SELECT 'restricción ' || conrelid::regclass || ' ' || conname || ': ' || pg_get_constraintdef(oid)
FROM pg_constraint
WHERE connamespace = 'public'::regnamespace
ORDER BY 1;

SELECT 'índice ' || indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY 1;

SELECT 'secuencia ' || sequencename || ': ' || coalesce(last_value::text, 'sin usar')
FROM pg_sequences
WHERE schemaname = 'public'
ORDER BY 1;
SQL
}

retrato "$URL_BASE" > "$trabajo/origen.txt"
retrato "$URL_DESTINO" > "$trabajo/restaurada.txt"

if ! diff "$trabajo/origen.txt" "$trabajo/restaurada.txt"; then
  echo "La base restaurada no es igual que la copiada: ver las diferencias de arriba." >&2
  exit 1
fi

# Que el retrato no esté vacío: dos bases sin nada también serían iguales.
tablas=$(grep -c '^tabla ' "$trabajo/origen.txt")
con_filas=$(grep '^tabla ' "$trabajo/origen.txt" | grep -vc ': 0 filas')
if [ "$con_filas" -lt 5 ]; then
  echo "La base copiada apenas tiene datos ($con_filas tablas con filas): el ensayo no prueba nada." >&2
  exit 1
fi

echo "Restaurada e idéntica: $tablas tablas ($con_filas con filas)," \
  "$(grep -c '^restricción ' "$trabajo/origen.txt") restricciones," \
  "$(grep -c '^índice ' "$trabajo/origen.txt") índices y" \
  "$(grep -c '^extensión ' "$trabajo/origen.txt") extensiones."
