# NWSPayFlow

Plataforma web para gestionar solicitudes de pago con roles **Líder**, **Holder** y **Cajero**. Incluye aprobaciones, ejecución de pagos, evidencias, reportes, chat interno y bot de Telegram para holders.

## Documentación

| Documento | Contenido |
|-----------|-----------|
| [docs/GUIA_USUARIOS_POR_ROL.md](docs/GUIA_USUARIOS_POR_ROL.md) | Qué puede hacer cada rol en la aplicación |
| [docs/DEPLOY_PRODUCCION.md](docs/DEPLOY_PRODUCCION.md) | Variables de entorno, build, Docker, checklist |

## Requisitos

- Node 22+, npm workspaces  
- PostgreSQL, Redis  
- Variables: copiar [`.env.example`](.env.example) y completar secretos

## Comandos útiles

```bash
npm install
npm run build          # monorepo (API + web)
npm run lint
npm run db:migrate:deploy
npm run db:seed        # usuarios de prueba (solo desarrollo)
```

**Desarrollo local:** `npm run dev` (Turbo) o levantar API y `apps/web` con Vite. Define `VITE_API_URL` en `apps/web` (p. ej. `http://localhost:3000/api`).

**Producción Docker:** ver [docs/DEPLOY_PRODUCCION.md](docs/DEPLOY_PRODUCCION.md) y `docker-compose.prod.yml`.

## Licencia

MIT
