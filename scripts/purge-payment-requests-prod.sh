#!/usr/bin/env bash
# Elimina TODAS las solicitudes de pago y notificaciones PAYMENT_* en PostgreSQL.
# Uso en el servidor (desde la raíz del repo, con .env cargado por compose):
#   chmod +x scripts/purge-payment-requests-prod.sh
#   ./scripts/purge-payment-requests-prod.sh
#
# Opcional: borrar archivos huérfanos en el volumen de uploads (después del SQL):
#   docker compose -f docker-compose.prod.yml exec api sh -lc 'rm -f /app/uploads/*'

set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
POSTGRES_SERVICE="${POSTGRES_SERVICE:-postgres}"
DB_USER="${DB_USER:-paymentflow}"
DB_NAME="${DB_NAME:-paymentflow}"

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "No se encontró $COMPOSE_FILE. Ejecuta este script desde la raíz del proyecto (donde está docker-compose.prod.yml)." >&2
  exit 1
fi

echo "-------------------------------------------------------------------"
echo "ATENCIÓN: se borrarán TODAS las filas de PaymentRequest y"
echo "notificaciones cuyo type empiece por PAYMENT_."
echo "Evidencias, timeline y aprobaciones se eliminan en cascada."
echo "Los archivos en /app/uploads NO se borran con este SQL; hazlo aparte si quieres."
echo "-------------------------------------------------------------------"
read -r -p "Escribe YES en mayúsculas para continuar: " confirm
if [[ "$confirm" != "YES" ]]; then
  echo "Cancelado."
  exit 1
fi

docker compose -f "$COMPOSE_FILE" exec -T "$POSTGRES_SERVICE" psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
DELETE FROM "Notification" WHERE "type" LIKE 'PAYMENT_%';
DELETE FROM "PaymentRequest";
COMMIT;
SQL

echo "Listo. Reinicia la API si tienes caché de listas: docker compose -f $COMPOSE_FILE restart api"
