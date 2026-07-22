# Portal de Captura de Pólizas

Portal de Click Seguros migrado a **React + TypeScript + MySQL** para capturar, validar y administrar pólizas, asegurados, grupos y bitácora desde una sola interfaz moderna.

## Qué incluye ahora

- Navegación en React con tabs en este orden:
  - Captura
  - Alta de asegurados
  - Pólizas
  - Bitácora
- Persistencia real en MySQL.
- API en TypeScript para bootstrap y CRUD básico.
- Catálogos legados importados desde el monolito original.
- Carga de archivos para pólizas y descarga desde el registro SQL.
- Lectura asistida con Anthropic desde el navegador cuando se captura una póliza.

## Estructura

- `index.html`: entrada de Vite para la app React.
- `src/`: interfaz, componentes y estilos.
- `server/src/`: API TypeScript que habla con MySQL.
- `scripts/seed-legacy.mjs`: genera la semilla SQL desde el legado.
- `legacy/index-monolith.html`: copia del portal anterior para bootstrap/migración.
- `storage/`: semilla, archivos generados en ejecución y caché temporal del arranque.

## Desarrollo

```bash
npm install
npm run dev
```

### Configuración MySQL

La API TypeScript lee estas variables de entorno:

- `MYSQL_HOST` o `DB_HOST`
- `MYSQL_PORT` o `DB_PORT`
- `MYSQL_DATABASE` o `DB_NAME`
- `MYSQL_USER` o `DB_USER`
- `MYSQL_PASSWORD` o `DB_PASS`
- `MYSQL_SOCKET` o `DB_SOCKET` opcional

El backend corre en Node/TypeScript y expone la API pública en `/api`, reenviada por Apache hacia ese servicio.

## Build

```bash
npm run build
```

## Estado

La versión React + TypeScript + MySQL con el ajuste para mostrar `Línea de negocio` y `Gerencia` en el tab `Captura` quedó publicada como `v0.0.22`.
