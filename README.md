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
  Botón **📅** por partido y **AGENDAR** por filtro: bajan un `.ics` con los
  canales, el deep link al visor y aviso 30 min antes. El box **QUE NECESITA
  LA ALBIRROJA** aparece solo cuando los escenarios (gana/empata/pierde)
  separan algo de verdad — enumera todos los resultados posibles del grupo.
- **P200 TABLA** — todo lo de grupos en una página, con sub-pestañas:
  **GRUPOS** (los 12 grupos), **CLASIFICACIÓN** (quiénes pasan: 1º y 2º de cada
  grupo + los 8 mejores terceros, y el camino a la final — cada llave con su
  **fecha, hora PY y sede** desde ya. Los equipos se llenan SOLOS con la tabla en
  vivo: 1º/2º apenas se define el grupo, ganadores ronda a ronda; lo único a mano
  son los 8 mejores terceros, que se cargan en `THIRDS_ASSIGN` (shared/bracket.ts)
  cuando FIFA cierre la fase de grupos, ≈28 JUN) y **GOLEADORES**. El calendario
  de eliminatorias vive en `KO_SCHEDULE` y lo resuelve `client/ko.ts`.
- **P300 PRODE** — pronosticá antes del pitazo inicial. Exacto +3, ganador +1.
- **P500 EN VIVO (VISOR)** — el partido en la misma página. **Trece, Unicanal y Popu TV**
  se embeben (Trece/Unicanal por su `/en-vivo`, Popu por el portal en vivo de
  GEN). **GEN y VS Sports NO se pueden incrustar** (el video por partido de VS
  en YouTube tiene la incrustación deshabilitada por el dueño, y el reproductor
  real de GEN está bloqueado por CSP a dominios Nación Media), así que muestran
  una **tarjeta de links**: ▶ **EN YOUTUBE (mejor calidad)** y **ABRIR el canal
  en su sitio**. **COPIAR LINK** comparte lo que estás viendo.

## Deep links (el hash es el número de página)

| Hash | Abre |
|---|---|
| `#100` / `#200` / `#300` | Agenda / Tabla / Prode |
| `#300-estados-unidos-paraguay` | El prode apuntado a ese partido |
| `#500-trece` | La señal de un canal en el visor (EN VIVO) |
| `#500-gen-estados-unidos-paraguay` | Ese partido en ese canal |

Atrás del navegador cierra el visor (una sola entrada de historial).

## PWA

Instalable desde Chrome/Android ("Agregar a la pantalla de inicio"). Manifest,
ícono y service worker se sirven como endpoints bajo `/api/` (Lakebed no sirve
estáticos sueltos). El SW cachea el shell — abre al instante y aguanta sin red
o con la cuota diaria agotada; `/api` va siempre a la red. Con un partido en
vivo, el marcador se ve en el título de la pestaña.

## Modo (preferencias del visitante)

Barra **⚙ MODO** (se guarda en el navegador, no toca Lakebed): efecto de tubo
**CRT** on/off, paleta **color / ámbar / verde** (monocromo retro; solo recolorea
la UI, el video del visor queda intacto), **🔊 GOL** (pitido sintetizado con
WebAudio al gol) y **🔔 AVISO** (notificación del navegador al gol cuando la
pestaña está de fondo). Con partidos en vivo aparece arriba una **cinta** con los
marcadores y goleadores, clickeable para abrir el partido.

## Compartir (vista previa Open Graph)

El botón **COMPARTIR** del visor copia un link `/s?p=<destino>`: un HTML con
etiquetas `og:*` que los crawlers (WhatsApp, Telegram, Twitter…) leen para armar
la vista previa, y que redirige al humano a la app por el hash. Hace falta porque
los deep links viven en el hash (`#500-…`), que ni el server ni los crawlers ven.
La imagen es una **tarjeta SVG** (`/api/og.svg`, estilo teletexto): se ve en
Telegram/Discord/iMessage; WhatsApp y Facebook ignoran SVG como `og:image`, así
que ahí queda la tarjeta de texto con título y descripción (igual una mejora
grande sobre el shell pelado). PNG no se puede: el cuerpo de un `endpoint` de
Lakebed es texto, no binario.

## Métricas

Visitas por [GoatCounter](https://www.goatcounter.com/) (sin cookies, sin datos
personales, fuera de Lakebed → no toca la cuota). El script se inyecta solo en
producción (`*.lakebed.app`); en local no cuenta nada.

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
- `server/index.ts` — datos en vivo (FIFA + GEN + VS) por la **query reactiva
  `data`** + la **mutación `refresh`** (un solo fetch/escritura por ventana se
  propaga por WebSocket a todos los que miran), schema/queries/mutations del
  prode, y los endpoints de la PWA. Los datos NO van por endpoint a propósito:
  cada hit a un endpoint cuenta como *mutation* (cuota chica, 1k/día) y se
  agotaba; las queries cuentan como *requests* (10k/día) y escalan con la gente.
  También expone `/api/og.svg` (tarjeta de compartir) y `/s` (página Open Graph
  con redirección) — ver **Compartir**.
- `client/` — Preact: teletexto (CSS propio), agenda, tabla, prode, **llaves**,
  visor, **cinta de vivos**, barra de preferencias y avisos de gol (pitido +
  notificación).

## Créditos

Grilla: fixture oficial de [@somosvssports](https://www.instagram.com/somosvssports/)
(Nación Media), con base de [@puntaje_ideal](https://www.instagram.com/puntaje_ideal/) y
[@futbolenlatv](https://www.instagram.com/futbolenlatv/). Datos en vivo: API
pública de la FIFA (no oficial). Solo se enlaza a transmisiones oficiales de
cada canal.

MIT · © 2026 Fernando Mendoza
