# Estado en la web: TanStack Query + Zustand + avisos globales

> Plan por fases y decisiones. Fuentes: documentación oficial de TanStack Query v5 (important defaults, query options, query keys, mutations, optimistic updates, infinite queries, testing, QueryCache/MutationCache, cancellation, devtools) y el CLI de shadcn 4.23.

## 1. Quién guarda qué

| Tipo de estado                       | Herramienta                        | Ejemplos                                                                                 | Por qué                                                                                                                                           |
| ------------------------------------ | ---------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Servidor** (lo que vive en la API) | **TanStack Query**                 | feed, sonidos, ranking, cifras, estado del bot                                           | Caché por clave, deduplicación, reintentos, cancelación (`signal`), refetch en segundo plano, paginación infinita                                 |
| **Mutaciones simples**               | **TanStack Query** (`useMutation`) | publicar, enviar a WhatsApp, contar un uso                                               | Estado `isPending` / `isError`, invalidación de lo afectado y errores globales                                                                    |
| **Cliente / UI**                     | **Zustand**                        | filtros (sincronizados con la URL), favoritos, reproductor, colección de la sesión, tema | No viene del servidor; se persiste en local storage o en la URL                                                                                   |
| **Flujo de conversión**              | **Zustand** (`converterStore`)     | archivo, opciones, progreso de subida, cancelar                                          | Usa `File` (no serializable), progreso real por XHR y cancelación que detiene FFmpeg en el servidor. Es un flujo de trabajo, no caché de servidor |
| **Efímero de un componente**         | `useState`                         | grabación en curso, diálogo abierto                                                      | No le importa a nadie más                                                                                                                         |

Regla: **nunca copiar datos del servidor a zustand.** Si un componente necesita datos del servidor, usa el hook de query. Si necesita estado de la interfaz, usa el store.

## 2. Arquitectura de carpetas

```
web/src/lib/
├── api.ts            transporte común: readJson + ApiError (código, estado HTTP)
├── notify.ts         ÚNICA puerta a los avisos (Sonner): success / error / info / promise
└── query/
    ├── client.ts     createQueryClient(): valores por defecto + errores globales (QueryCache/MutationCache) + tipos `Register`
    └── keys.ts       fábrica de query keys jerárquicas

web/src/features/<feature>/api/
├── endpoints.ts      funciones fetch tipadas con el contrato compartido (@contract), aceptan `signal`
├── queries.ts        queryOptions / infiniteQueryOptions reutilizables + hooks finos
└── mutations.ts      useMutation con mutationKey, invalidaciones y meta de avisos
```

- **El contrato es la única fuente de tipos** entre la API y la web (`src/adapters/http/contract.ts`, alias `@contract`).
- **`queryOptions` / `infiniteQueryOptions`**: la misma definición sirve para `useQuery`, `prefetchQuery`, `getQueryData`, `setQueryData` y `invalidateQueries`, con tipos inferidos.
- **Query keys jerárquicas**: invalidar `['community']` refresca todo lo de comunidad; `['community','feed',filtros]` refresca un feed concreto. La clave incluye todas las variables que usa la función de consulta.

## 3. Avisos globales (Sonner)

- `npx shadcn@latest add toast` **no aplica a este proyecto**. El CLI responde: _«The toast component is only available for Base UI projects. Use the sonner component instead.»_ Este proyecto usa Radix (`radix-nova`), y Sonner ya está instalado con un `<Toaster />` global.
- No se vuelve a ejecutar `add sonner`: sobrescribiría `components/ui/sonner.tsx` y reinstalaría `next-themes`, que se reemplazó por nuestro `ThemeProvider`.
- **`notify`** es la única API de avisos. Ningún componente importa `sonner` directamente. Ventajas: cambiar la librería afecta un solo archivo, los errores repetidos se agrupan (un mismo `id` no apila toasts) y los mensajes salen de `ApiError`.
- **Errores globales** (`createQueryClient`):
  - _Mutaciones_: cualquier error muestra un aviso, salvo que lleve `meta: { errorMessage: false }` (el componente lo maneja él mismo). Con `meta.errorMessage` se usa un texto propio.
  - _Queries_: se avisa solo si **ya había datos en pantalla** (falló un refetch en segundo plano). En la primera carga, el error lo muestra la propia UI (estado vacío con «Reintentar»), para no duplicarlo.
  - _Éxito_: `meta.successMessage` muestra un aviso al terminar bien.

## 4. Fases

| Fase                         | Contenido                                                                                                                                                                                                                              | Estado    |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| **0. Base**                  | `createQueryClient` (valores por defecto, `QueryCache`/`MutationCache` globales, tipos `Register` para `meta` y errores), `notify`, Devtools solo en desarrollo (carga diferida), utilidades de test                                   | ✅        |
| **1. Lecturas del servidor** | Comunidad con `queryOptions`/`infiniteQueryOptions` y keys centralizadas; **estado del bot** migrado de zustand + `setInterval` a `useQuery` con `refetchInterval` (se pausa con la pestaña oculta y comparte caché entre componentes) | ✅        |
| **2. Mutaciones**            | Publicar, enviar a WhatsApp y contar uso de sonido con `useMutation`: `mutationKey`, invalidaciones (`community`, `bot`) y avisos por `meta`                                                                                           | ✅        |
| **3. Avisos globales**       | Todos los `toast` directos pasan a `notify`; los errores de red llegan por las cachés globales                                                                                                                                         | ✅        |
| **4. Tests**                 | Unitarios de keys, `notify` y errores globales (QueryClient nuevo por test, `retry: false`). Hooks con `renderHook` en happy-dom y `fetch` simulado. Las e2e cubren el flujo real                                                      | ✅        |
| **5. Siguiente**             | Prefetch del feed al pasar por «Comunidad», actualizaciones optimistas de favoritos cuando haya cuentas (fase 1 de comunidad), `useSuspenseQuery` + límites de error si se adopta Suspense                                             | Pendiente |

## 5. Valores por defecto elegidos

| Opción                 | Valor                                                         | Motivo                                                                                              |
| ---------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `staleTime`            | 30 s                                                          | La API es local y los datos cambian poco; evita refetch en cada montaje (el valor de TanStack es 0) |
| `gcTime`               | 5 min                                                         | Valor de TanStack: volver a «Comunidad» es instantáneo                                              |
| `retry`                | 1 (queries), 0 (mutaciones)                                   | API local: si falla dos veces, es un error real; publicar o enviar no deben repetirse solos         |
| `refetchOnWindowFocus` | `false`                                                       | Evita ráfagas al cambiar de pestaña; el estado del bot ya tiene su propio intervalo                 |
| Estado del bot         | `refetchInterval: 10 s`, `refetchIntervalInBackground: false` | Con la pestaña oculta deja de consultar                                                             |
