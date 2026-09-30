#!/usr/bin/env bash
# Copia de la base, cifrada antes de escribirse en ningún disco.
#
# Uso: URL_BASE=postgresql://… DESTINATARIO=age1… scripts/copia-base.sh <salida.age>
#
# La copia en claro solo existe en memoria (/dev/shm). Lo que llega al disco
# del runner, y de ahí a los artefactos, ya va cifrado con la clave pública
# de DESTINATARIO: el repositorio es público y cualquiera con cuenta en
# GitHub puede descargar los artefactos de un flujo. Descifrarla pide la
# clave privada, que no está en GitHub. Cómo restaurarla: docs/OPERATIONS.md.
set -euo pipefail

salida=${1:?Falta el fichero de salida}
: "${URL_BASE:?Falta URL_BASE}"
: "${DESTINATARIO:?Falta DESTINATARIO, la clave pública de age}"

claro=$(mktemp -p /dev/shm copia.XXXXXX)
trap 'rm -f "$claro"' EXIT

pg_dump --format=custom --no-owner --no-privileges \
  --dbname="$URL_BASE" --file="$claro"

# Que se puede leer y trae las tablas que importan, antes de darla por buena.
indice=$(pg_restore --list "$claro")
for tabla in users services bookings payments reviews; do
  if ! grep -q "TABLE DATA public $tabla " <<<"$indice"; then
    echo "La copia no trae los datos de «$tabla»: algo ha ido mal." >&2
    exit 1
  fi
done

age --recipient "$DESTINATARIO" --output "$salida" "$claro"
echo "Copia de $(grep -c 'TABLE DATA' <<<"$indice") tablas, $(du -h "$salida" | cut -f1) cifrados."
