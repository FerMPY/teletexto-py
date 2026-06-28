// "QUÉ HAY DE NUEVO": avisos one-time para que el visitante se entere de una
// sección nueva. Se guarda en el navegador qué anuncios ya vio (no toca Lakebed),
// igual que las preferencias. Un contexto compartido para que la banda de aviso y
// el chip "NUEVO" de la pestaña se apaguen juntos en la misma pestaña.
//
// Aesthetic: NO usamos parpadeo — la regla del teletexto acá es UN solo elemento
// que parpadea (la cinta de "en vivo"). El aviso resalta por color y posición.
import { createContext } from "preact";
import { useContext, useEffect, useState } from "preact/hooks";
import { C } from "./teletext";

export type News = { id: string; tag: string; text: string };

// Anuncios, del más reciente arriba. El id NO se reusa (es la marca de "ya visto").
export const NEWS: News[] = [
  { id: "16avos-listos-2026", tag: "NUEVO", text: "¡ARRANCARON LOS DIECISEISAVOS! YA ESTÁN LOS 32 CRUCES CON DÍA, HORA (PY) Y CANAL DE TV. PARAGUAY 🇵🇾 VS ALEMANIA 🇩🇪 EL LUN 29 JUN 17:30, POR GEN, TRECE, POPU, UNICANAL Y VS SPORTS." },
  { id: "elim-fechas-2026", tag: "NUEVO", text: "YA ESTÁN LAS FECHAS, HORAS (PY) Y SEDES DE LAS ELIMINATORIAS: DESDE LOS DIECISEISAVOS (28 JUN) EN LA AGENDA Y EN EL CUADRO, CON LOS EQUIPOS LLENÁNDOSE SOLOS." },
  { id: "cuadro-2026", tag: "NUEVO", text: "YA ESTÁ EL CUADRO DE ELIMINATORIAS: 1º, 2º Y LOS 8 MEJORES TERCEROS, CON EL CAMINO A LA FINAL." },
];

const KEY = "tt-seen";
const load = (): string[] => { try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; } };

type Ctx = { isSeen: (id: string) => boolean; markSeen: (id: string) => void };
const SeenCtx = createContext<Ctx>({ isSeen: () => true, markSeen: () => {} });

export function SeenProvider({ children }: { children: any }) {
  const [seen, setSeen] = useState<string[]>(load);
  const markSeen = (id: string) =>
    setSeen((cur) => {
      if (cur.includes(id)) return cur;
      const next = [...cur, id];
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* modo incógnito */ }
      return next;
    });
  // otras pestañas abiertas: si allá marcan visto, acá también
  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === KEY) setSeen(load()); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  return <SeenCtx.Provider value={{ isSeen: (id) => seen.includes(id), markSeen }}>{children}</SeenCtx.Provider>;
}
export const useSeen = () => useContext(SeenCtx);

// Banda de aviso: el primer anuncio sin ver. VER salta a la sección; ✕ lo cierra.
// Ambos lo marcan como visto (no vuelve a aparecer).
export function NewsFlash({ onGo }: { onGo: () => void }) {
  const { isSeen, markSeen } = useSeen();
  const item = NEWS.find((n) => !isSeen(n.id));
  if (!item) return null;
  return (
    <div className="tt-news">
      <span className="tt-news-tag">► {item.tag}</span>
      <span className="tt-news-txt tt-glow">{item.text}</span>
      <button className="tt-btn ch" style={{ color: C.g }} onClick={() => { markSeen(item.id); onGo(); }}>VER</button>
      <button className="tt-btn tt-news-x" title="Cerrar" aria-label="Cerrar aviso" onClick={() => markSeen(item.id)}>✕</button>
    </div>
  );
}

// Chip "NUEVO" para una pestaña; se apaga cuando el visitante ya vio esa sección.
export function Nuevo({ id }: { id: string }) {
  const { isSeen } = useSeen();
  if (isSeen(id)) return null;
  return <span className="tt-new">NUEVO</span>;
}
