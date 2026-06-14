// Preferencias del visitante (se guardan en el navegador, no tocan Lakebed):
//  - crt    efecto de tubo (scanlines + viñeta) on/off
//  - theme  paleta: color (teletexto clásico), ámbar o verde (monocromo retro)
//  - sfx    pitido al gol
//  - notify aviso del navegador al gol cuando la pestaña está de fondo
import { createContext } from "preact";
import { useContext, useEffect, useState } from "preact/hooks";

export type Theme = "color" | "amber" | "green";
export type Prefs = { crt: boolean; theme: Theme; sfx: boolean; notify: boolean };

const DEFAULTS: Prefs = { crt: true, theme: "color", sfx: false, notify: false };
const KEY = "tt-prefs";

function load(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch { return DEFAULTS; }
}

type Ctx = { prefs: Prefs; set: (p: Partial<Prefs>) => void };
const PrefsCtx = createContext<Ctx>({ prefs: DEFAULTS, set: () => {} });

export function PrefsProvider({ children }: { children: any }) {
  const [prefs, setPrefs] = useState<Prefs>(load);
  const set = (p: Partial<Prefs>) =>
    setPrefs((cur) => {
      const next = { ...cur, ...p };
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* modo incógnito */ }
      return next;
    });
  // mantené sincronizadas otras pestañas abiertas
  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === KEY) setPrefs(load()); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  return <PrefsCtx.Provider value={{ prefs, set }}>{children}</PrefsCtx.Provider>;
}

export const usePrefs = () => useContext(PrefsCtx);
