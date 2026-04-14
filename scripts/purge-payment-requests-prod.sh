#!/usr/bin/env bash
# Elimina TODAS las solicitudes de pago y notificaciones PAYMENT_* en PostgreSQL.
# Opcionalmente borra del volumen solo los archivos referenciados por esas solicitudes
# (evidencias y comprobantes de pago en /uploads), sin tocar avatares ni otros ficheros.
#
# Uso en el servidor (desde la raíz del repo):
#   chmod +x scripts/purge-payment-requests-prod.sh
#   ./scripts/purge-payment-requests-prod.sh
#
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
POSTGRES_SERVICE="${POSTGRES_SERVICE:-postgres}"
API_SERVICE="${API_SERVICE:-api}"
DB_USER="${DB_USER:-paymentflow}"
DB_NAME="${DB_NAME:-paymentflow}"
UPLOAD_DIR_IN_CONTAINER="${UPLOAD_DIR_IN_CONTAINER:-/app/uploads}"

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "No se encontró $COMPOSE_FILE. Ejecuta este script desde la raíz del proyecto (donde está docker-compose.prod.yml)." >&2
  exit 1
fi

echo "-------------------------------------------------------------------"
echo "ATENCIÓN: se borrarán TODAS las filas de PaymentRequest y"
echo "notificaciones cuyo type empiece por PAYMENT_."
echo "Evidencias, timeline y aprobaciones se eliminan en cascada."
echo "-------------------------------------------------------------------"
read -r -p "Escribe YES en mayúsculas para continuar: " confirm
if [[ "$confirm" != "YES" ]]; then
  echo "Cancelado."
  exit 1
fi

echo ""
echo "¿Borrar del disco los archivos de evidencias y comprobantes enlazados a esas solicitudes?"
echo "(Solo nombres bajo uploads referenciados en la BD; no se hace rm -f de todo el directorio.)"
read -r -p "Escribe SI para borrar archivos, u otra cosa para omitir: " del_files

paths_to_delete=()
if [[ "$del_files" == "SI" ]]; then
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    base="$(basename "$line")"
    [[ "$base" == "." || "$base" == ".." ]] && continue
    paths_to_delete+=("$base")
  done < <(
    docker compose -f "$COMPOSE_FILE" exec -T "$POSTGRES_SERVICE" psql -U "$DB_USER" -d "$DB_NAME" -t -A <<'SQL'
SELECT DISTINCT filepath FROM "Evidence"
WHERE filepath NOT LIKE 's3://%'
  AND filepath NOT LIKE 'http://%'
  AND filepath NOT LIKE 'https://%'
  AND (filepath LIKE '/uploads/%' OR filepath LIKE 'uploads/%');
SELECT DISTINCT "paymentProofUrl" FROM "PaymentRequest"
WHERE "paymentProofUrl" IS NOT NULL
  AND "paymentProofUrl" NOT LIKE 's3://%'
  AND "paymentProofUrl" NOT LIKE 'http://%'
  AND "paymentProofUrl" NOT LIKE 'https://%'
  AND ("paymentProofUrl" LIKE '/uploads/%' OR "paymentProofUrl" LIKE 'uploads/%');
SQL
  )
fi

docker compose -f "$COMPOSE_FILE" exec -T "$POSTGRES_SERVICE" psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
DELETE FROM "Notification" WHERE "type" LIKE 'PAYMENT_%';
DELETE FROM "PaymentRequest";
COMMIT;
SQL

if [[ "$del_files" == "SI" && ${#paths_to_delete[@]} -gt 0 ]]; then
  # shellcheck disable=SC2207
  paths_to_delete=($(printf '%s\n' "${paths_to_delete[@]}" | sort -u))
  n=0
  for base in "${paths_to_delete[@]}"; do
    docker compose -f "$COMPOSE_FILE" exec -T "$API_SERVICE" rm -f -- "${UPLOAD_DIR_IN_CONTAINER%/}/$base" && n=$((n + 1)) || true
  done
  echo "Archivos eliminados (intentos): $n"
elif [[ "$del_files" == "SI" ]]; then
  echo "No había rutas locales en BD para borrar del disco."
fi

echo "Listo. Reinicia la API si tienes caché de listas: docker compose -f $COMPOSE_FILE restart api"
