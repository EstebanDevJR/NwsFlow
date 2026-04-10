# Despliegue en producción (NWSPayFlow)

## 1. Secretos y entorno

1. Copia `.env.example` a `.env` en la raíz del proyecto.
2. Genera valores **largos y aleatorios** para:
   - `JWT_SECRET`, `JWT_REFRESH_SECRET`
   - `DB_PASSWORD`
   - `BOT_INTERNAL_TOKEN`
   - `TELEGRAM_WEBHOOK_SECRET` (si usas webhook)
3. Configura al menos:
   - `DATABASE_URL` / `DB_*` coherentes con Postgres
   - `REDIS_URL`
   - `API_PUBLIC_URL` = URL pública base **sin** `/api` (ej. `https://tudominio.com`) para enlaces a evidencias y avatares
   - `FRONTEND_URL` = URL del sitio web (origen del navegador)
   - `TRUST_PROXY=true` (o `1`) si hay nginx/HTTPS delante
   - `CORS_ORIGINS` o `FRONTEND_URL` para CORS (la API acepta lista en `CORS_ORIGINS` separada por comas; si no, usa `FRONTEND_URL`)

## 2. Frontend: `VITE_API_URL`

El build de Vite **incrusta** la URL de la API en el JavaScript. Debe ser la URL **pública** que el navegador usa, **incluyendo** `/api`, por ejemplo:

`https://tudominio.com/api`

Al construir la imagen Docker, pasa el argumento:

```bash
docker compose -f docker-compose.prod.yml build --build-arg VITE_API_URL=https://tudominio.com/api
```

O define `VITE_API_URL` en el entorno antes del `build` si tu CI lo inyecta en el `Dockerfile` (etapa `builder`).

**No** confíes en poner `VITE_API_URL` solo en el contenedor `frontend` en tiempo de ejecución: el HTML/JS ya está compilado.

## 3. Base de datos

```bash
npm run db:migrate:deploy
# o, dentro del contenedor API:
npx prisma migrate deploy --schema=packages/database/prisma/schema.prisma
```

En `docker-compose.prod.yml`, `RUN_MIGRATIONS` puede ejecutar migraciones al arrancar el API (revisar `scripts/docker-api-entrypoint.sh`).

## 4. Almacenamiento de archivos

- Sin S3: archivos en `UPLOAD_DIR` (p. ej. `uploads/`). En Docker, monta un **volumen** persistente (ya previsto en compose para `uploads`).
- Con S3/MinIO: define `S3_*` según `.env.example`.

## 5. Orquestación

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Ajusta `nginx.conf` y certificados TLS (`./ssl`) para HTTPS en el servidor.

## 6. Checklist rápido

- [ ] Secretos fuertes y únicos
- [ ] `API_PUBLIC_URL` y `TRUST_PROXY` acordes al proxy
- [ ] Build del front con `VITE_API_URL` correcto
- [ ] Migraciones aplicadas
- [ ] Volumen `uploads` persistente si usas disco local
- [ ] Redis y Postgres sanos (healthchecks)
- [ ] `ALLOW_PUBLIC_REGISTRATION=false` salvo que quieras registro abierto de líderes
- [ ] Bot de Telegram: `TELEGRAM_BOT_TOKEN`, `BOT_API_URL` interno, webhook si aplica

## 7. Pruebas

- Login por rol (Líder, Holder, Cajero)
- Crear solicitud con evidencia y método de pago
- Flujo aprobar → marcar pagado con comprobante
- Descarga de reporte (Holder)
