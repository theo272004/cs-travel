#!/usr/bin/env bash
# RETIRADO. Este script compilaba el portal real con `vite build --base=/portal-app/`
# SIN quitar de la semilla (src/data/db.json) los usuarios y sus contraseñas de
# prueba: el bundle publicado quedaba con ellas adentro.
#
# Usa en su lugar:
#   node scripts/rebundle-local.mjs [ruta/a/cstravelgroup]
# que compila con la semilla filtrada, revisa que no quede ninguna contraseña y
# solo entonces copia a cstravelgroup/public/portal-app.
set -e
echo "scripts/rebundle-portal.sh esta retirado: usa 'node scripts/rebundle-local.mjs'." >&2
exec node "$(dirname "$0")/rebundle-local.mjs" "$@"
