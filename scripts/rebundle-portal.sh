#!/usr/bin/env bash
# OBSOLETO: se deja solo para que el comando de siempre siga funcionando.
#
# Este script copiaba el build tal cual, con la semilla db.json ENTERA: las
# cuentas demo con sus contrasenas y los datos de Eventos terminaban en el
# portal real. Ahora delega en rebundle-local.mjs, que los quita y revisa el
# bundle antes de copiar nada.
set -e
cd "$(dirname "$0")/.."
exec node scripts/rebundle-local.mjs "$@"
