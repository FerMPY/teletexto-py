# TELETEXTO PY — Mundial 2026 🇵🇾📺

**[teletexto.lakebed.app](https://teletexto.lakebed.app)**

El Mundial 2026 como lo hubiera dado el teletexto: agenda con **los canales
paraguayos** (GEN, Trece, Unicanal, Popu TV, VS Sports), marcadores y
goleadores **en vivo** (API pública de la FIFA), tabla de grupos, **visor en la
misma página** y un **PRODE** con tabla de posiciones entre los que juegan.

Port a [Lakebed](https://lakebed.dev) del proyecto
[mundial-2026-paraguay](https://github.com/FerMPY/mundial-2026-paraguay)
(Vite + Node). Acá el server son endpoints del capsule y el prode usa la db y
el auth integrados de Lakebed (invitado local, Google en producción).

## Páginas (como el control remoto: tipeá el número)

- **P100 AGENDA** — partidos por día, filtros, marcador y minuto en vivo,
  goleadores. Cada partido muestra **los 5 canales**: en color los que figuran
  en la grilla, apagados el resto (la grilla a veces falla — probalos igual).
- **P200 TABLA** — los 12 grupos, actualizada con cada partido.
- **P300 PRODE** — pronosticá antes del pitazo inicial. Exacto +3, ganador +1.
- **P500 VISOR** — el partido embebido: GEN/VS abren el video del partido en
  YouTube cuando lo capturamos; Trece/Unicanal embeben su página en vivo; Popu
  va por el portal en vivo de GEN (mismo grupo). Aviso CARGANDO mientras el
  portal del canal tarda, y botón **COPIAR LINK** para compartir lo que estás
  viendo.

## Deep links (el hash es el número de página)

| Hash | Abre |
|---|---|
| `#100` / `#200` / `#300` | Agenda / Tabla / Prode |
| `#300-estados-unidos-paraguay` | El prode apuntado a ese partido |
| `#500-trece` | La señal de un canal en el visor |
| `#500-gen-estados-unidos-paraguay` | Ese partido en ese canal |

Atrás del navegador cierra el visor (una sola entrada de historial).

## Correr local

```sh
npx lakebed dev
```

## Deploy

```sh
npx lakebed auth login   # necesario: el fetch saliente (FIFA/GEN/YouTube)
npx lakebed deploy       # está deshabilitado en deploys anónimos
```

## Estructura

- `shared/mundial.ts` — tipos, canales, normalización de nombres, reglas del prode.
- `shared/matches.ts` — la agenda (se edita acá para octavos; redeploy para publicar).
- `server/index.ts` — `/api/data` (FIFA + GEN + VS, con caché) + schema/queries/mutations del prode.
- `client/` — Preact: teletexto (CSS propio), agenda, tabla, prode, visor.

## Créditos

Grilla: fixture oficial de [@somosvssports](https://www.instagram.com/somosvssports/)
(Nación Media), con base de [@puntaje_ideal](https://www.instagram.com/puntaje_ideal/) y
[@futbolenlatv](https://www.instagram.com/futbolenlatv/). Datos en vivo: API
pública de la FIFA (no oficial). Solo se enlaza a transmisiones oficiales de
cada canal.

MIT · © 2026 Fernando Mendoza
