# Portal de Captura de Pólizas

Portal de Click Seguros migrado a **React + SQLite** para capturar, validar y administrar pólizas, asegurados, grupos y bitácora desde una sola interfaz moderna.

## Qué incluye ahora

- Navegación en React con tabs en este orden:
  - Captura
  - Alta de asegurados
  - Pólizas
  - Bitácora
- Persistencia real en SQLite.
- API en `api.php` para bootstrap y CRUD básico.
- Catálogos legados importados desde el monolito original.
- Carga de archivos para pólizas y descarga desde el registro SQL.
- Lectura asistida con Anthropic desde el navegador cuando se captura una póliza.

## Estructura

- `index.html`: entrada de Vite para la app React.
- `src/`: interfaz, componentes y estilos.
- `api.php`: API PHP que habla con SQLite.
- `scripts/seed-legacy.mjs`: genera la semilla SQL desde el legado.
- `legacy/index-monolith.html`: copia del portal anterior para bootstrap/migración.
- `storage/`: base SQLite y archivos generados en ejecución.

## Desarrollo

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Estado

La primera versión React + SQL de la migración quedó publicada como `v0.0.6`.
