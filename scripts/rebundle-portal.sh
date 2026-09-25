#!/usr/bin/env bash
# Re-empaqueta el SPA del prototipo (demo cs-travel) en el portal real de Wix
# (cstravelgroup/public/portal-app) para sincronizar producción con el demo.
# Pasos: build --base=/portal-app/ -> copiar -> convertir bg PNG a WebP + arreglar
# refs en JS/CSS (las imágenes de fondo pesan MB en PNG; WebP las deja en KB).
set -e
PROTO="/c/Users/NICOLAS/Desktop/herramienta cs travel"
PORTAL="/c/Users/NICOLAS/Desktop/cstravelgroup/public/portal-app"

cd "$PROTO"
echo "== 1) build --base=/portal-app/ =="
MSYS_NO_PATHCONV=1 npx vite build --base=/portal-app/ 2>&1 | tail -2

echo "== 2) reemplazar portal-app con el nuevo dist =="
rm -rf "$PORTAL"
cp -r dist "$PORTAL"

echo "== 3) convertir bg PNG -> WebP y arreglar refs (excepto logo) =="
cd "$PORTAL/assets"
for png in *.png; do
  [ -e "$png" ] || continue
  case "$png" in logo-cs*) echo "  (mantengo PNG) $png"; continue;; esac
  webp="${png%.png}.webp"
  ffmpeg -y -i "$png" -quality 80 "$webp" >/dev/null 2>&1
  rm -f "$png"
  # Actualizar refs en TODOS los JS y CSS del bundle (vite referencia imágenes
  # tanto en CSS url() como en imports de JS).
  for f in *.js *.css; do [ -e "$f" ] && sed -i "s|$png|$webp|g" "$f"; done
  echo "  $png -> $webp"
done

echo "== 4) resultado =="
echo "Total assets: $(du -sh "$PORTAL/assets" | cut -f1)"
echo "Imagenes:"; ls -1 "$PORTAL/assets" | grep -iE "\.(webp|png)$"
echo "Quedan PNG de fondo sin convertir? (deberia ser solo el logo):"
ls -1 "$PORTAL/assets"/*.png 2>/dev/null || echo "  ninguno"
