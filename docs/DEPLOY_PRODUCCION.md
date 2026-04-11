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

## 8. DigitalOcean Droplet (DNS ya apuntando al servidor)

### 8.1 DNS

- En tu proveedor DNS: registro **A** del host (p. ej. `@` o `app`) → **IP pública del droplet**.
- Espera propagación (minutos a horas). Comprueba: `dig +short tudominio.com`.

### 8.2 Servidor: Docker y firewall

En el droplet (Ubuntu de ejemplo):

```bash
sudo apt update && sudo apt install -y ca-certificates curl git
# Docker oficial: https://docs.docker.com/engine/install/ubuntu/
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update && sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"   # cerrar sesión y volver a entrar
```

Firewall (UFW):

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### 8.3 Código y `.env`

```bash
cd ~
git clone https://github.com/TU_ORG/NwsFlow.git && cd NwsFlow
cp .env.example .env
nano .env   # o vim
```

Genera secretos (ejemplo):

```bash
openssl rand -base64 48   # repite para JWT_SECRET, JWT_REFRESH_SECRET, BOT_INTERNAL_TOKEN, TELEGRAM_WEBHOOK_SECRET
```

En `.env` sustituye **`tudominio.com`** por tu dominio real (HTTPS):

| Variable | Ejemplo |
|----------|---------|
| `DB_PASSWORD` | Fuerte, único |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | ≥32 caracteres, distintos |
| `BOT_INTERNAL_TOKEN` | ≥16 caracteres |
| `API_PUBLIC_URL` | `https://tudominio.com` |
| `FRONTEND_URL` | `https://tudominio.com` |
| `CORS_ORIGINS` | `https://tudominio.com` |
| `VITE_API_URL` | `https://tudominio.com/api` |
| `TRUST_PROXY` | `true` (obligatorio detrás de nginx/HTTPS en el droplet) |
| `TELEGRAM_*` / `RESEND_*` | Si usas bot o email |

`docker compose` lee `.env` en la raíz; **`VITE_API_URL`** debe estar bien **antes** del build (se incrusta en el JS del front).

### 8.4 Primer arranque (solo HTTP, para probar)

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f api
```

Abre `http://IP_DEL_DROPLET` o `http://tudominio.com` y comprueba que carga. Si algo falla, revisa logs de `api` y `nginx`.

### 8.5 HTTPS (Let’s Encrypt) y activar SSL en nginx

1. **Certificados** (con los contenedores **parados** para liberar 80, o usa otro método que prefieras):

```bash
cd ~/NwsFlow
docker compose -f docker-compose.prod.yml stop nginx
sudo apt install -y certbot
sudo certbot certonly --standalone -d tudominio.com -d www.tudominio.com
```

2. Copia los PEM al repo (ruta típica de Certbot):

```bash
sudo mkdir -p ssl
sudo cp /etc/letsencrypt/live/tudominio.com/fullchain.pem ssl/
sudo cp /etc/letsencrypt/live/tudominio.com/privkey.pem ssl/
sudo chown -R "$USER:$USER" ssl
chmod 600 ssl/privkey.pem
```

3. En **`nginx.conf`**, dentro de `http { }`, **descomenta** la línea:

   `include /etc/nginx/ssl-server.conf;`

4. Opcional: en el `server { listen 80; ... }` añade redirección a HTTPS (puedes usar un bloque `return 301 https://$host$request_uri;` solo cuando ya tengas 443 funcionando).

5. Levanta de nuevo:

```bash
docker compose -f docker-compose.prod.yml up -d
```

Renovación: `certbot renew` suele ir en **cron**; tras renovar, vuelve a copiar o enlazar los PEM a `./ssl/` y `docker compose restart nginx`.

### 8.6 Telegram (si aplica)

- `TELEGRAM_WEBHOOK_URL` debe ser la URL **HTTPS** pública que Telegram puede alcanzar (misma base que `API_PUBLIC_URL` + ruta del webhook que uses en la app).
- `BOT_API_URL` en compose apunta a `http://api:3000/api` (red interna Docker); no lo cambies salvo que reorganices servicios.

### 8.7 Comandos útiles

```bash
docker compose -f docker-compose.prod.yml logs -f --tail=200 api
docker compose -f docker-compose.prod.yml exec api npx prisma migrate deploy --schema=packages/database/prisma/schema.prisma
docker compose -f docker-compose.prod.yml pull   # si usas imágenes preconstruidas
docker compose -f docker-compose.prod.yml down
```

### 8.8 Build falla en el droplet (`npm run build` / `tsc`)

Compilar la imagen (`npm ci`, `tsc`, Vite) puede usar **más de 1–2 GB de RAM**. En droplets pequeños (512 MB / 1 GB) el proceso puede morir o `tsc` puede fallar sin mostrar el error completo en el resumen de Docker.

1. **Ver el error real de TypeScript** (salida completa):

```bash
cd ~/NwsFlow
docker compose -f docker-compose.prod.yml build --no-cache --progress=plain api 2>&1 | tee /tmp/docker-build.log
```

Revisa `/tmp/docker-build.log` buscando líneas `error TS`.

2. **Poca RAM / OOM**: añade **swap** (ej. 2 GB) y vuelve a construir:

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

3. **Alternativa recomendada**: construir la imagen en **GitHub Actions** (u otro CI), subirla al registry y en el droplet solo `docker compose pull` + `up`, sin compilar en el servidor.
