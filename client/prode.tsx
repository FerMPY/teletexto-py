// P300 — PRODE: pronosticá los partidos antes de que arranquen y sumá puntos.
// Exacto = 3 PTS · acertar ganador/empate = 1 PT. Usa la db + auth de Lakebed.
import { SignInWithGoogle, signOut, useAuth, useMutation, useQuery } from "lakebed/client";
import { useEffect, useState } from "preact/hooks";
import { MATCHES } from "../shared/matches";
import { clampGoals, kickoffEpoch, pk, prodePoints } from "../shared/mundial";
import type { ApiData, Match } from "../shared/mundial";
import { C, Sep, TitleBar } from "./teletext";
import { dayLabel, matchState, mKey } from "./state";
import type { Indexes } from "./state";

// hs/as viajan como string (la db de Lakebed no tiene columnas numéricas)
type Pred = { id: string; matchKey: string; hs: string; as: string };

function PredRow({ m, pred, locked, idx, nowK, onSave }: {
  m: Match; pred: Pred | undefined; locked: boolean; idx: Indexes; nowK: string;
  onSave: (matchKey: string, hs: number, as: number) => Promise<void>;
}) {
  const [hs, setHs] = useState<string>(pred ? pred.hs : "");
  const [as, setAs] = useState<string>(pred ? pred.as : "");
  const [saved, setSaved] = useState(false);
  const st = matchState(m, idx, nowK);
  const dirty = pred ? (hs !== pred.hs || as !== pred.as) : (hs !== "" && as !== "");

  // puntos obtenidos si ya hay resultado final
  let earned: number | null = null;
  if (pred && st.final && st.hs != null && st.as != null) {
    earned = prodePoints({ hs: Number(pred.hs), as: Number(pred.as) }, { hs: st.hs, as: st.as });
  }

  return (
    <div className={`tt-row${m.py ? " py" : ""}`}>
      <span style={{ color: C.c }}>{m.t}</span>
      <span style={{ color: C.y }}>{m.fa} {m.a}</span>
      {locked ? (
        <span style={{ color: "#fff" }}>{pred ? `${pred.hs}-${pred.as}` : "—"}</span>
      ) : (
        <span className="inline-flex items-baseline gap-1">
          <input className="tt-in" inputMode="numeric" value={hs} onInput={(e) => { setHs((e.currentTarget as HTMLInputElement).value); setSaved(false); }} />
          <span style={{ color: C.dim }}>-</span>
          <input className="tt-in" inputMode="numeric" value={as} onInput={(e) => { setAs((e.currentTarget as HTMLInputElement).value); setSaved(false); }} />
        </span>
      )}
      <span style={{ color: C.y }}>{m.b} {m.fb}</span>
      {!locked && dirty && (
        <button
          className="tt-btn" style={{ color: C.g }}
          onClick={async () => {
            if (hs === "" || as === "") return;
            await onSave(mKey(m), clampGoals(Number(hs)), clampGoals(Number(as)));
            setSaved(true);
          }}
        >OK</button>
      )}
      {!locked && saved && !dirty && <span style={{ color: C.g }}>✓</span>}
      {locked && st.hs != null && <span style={{ color: C.dim }}>REAL {st.hs}-{st.as}</span>}
      {earned != null && (
        <span style={{ color: earned === 3 ? C.g : earned === 1 ? C.y : C.r }} className="tt-glow">
          {earned === 3 ? "+3 EXACTO!" : earned === 1 ? "+1" : "0 PTS"}
        </span>
      )}
    </div>
  );
}

const slug = (s: string) => s.replace(/[^a-z0-9]+/gi, "-");

export function Prode({ data, idx, nowK, nowMs, target }: { data: ApiData | null; idx: Indexes; nowK: string; nowMs: number; target?: string | null }) {
  // si venís del chip PRODE de la agenda, te lleva derecho a ESE partido
  useEffect(() => {
    if (!target) return;
    const el = document.getElementById(`pred-${slug(target)}`);
    if (el) {
      el.scrollIntoView({ block: "center" });
      el.classList.add("tt-hl");
      (el.querySelector("input") as HTMLInputElement | null)?.focus();
      setTimeout(() => el.classList.remove("tt-hl"), 2600);
    }
  }, [target]);
  const auth = useAuth();
  const myPreds = useQuery<Pred[]>("myPredictions");
  const predict = useMutation<[matchKey: string, hs: number, as: number], void>("predict");
  const predBy: Record<string, Pred> = {};
  for (const p of myPreds || []) predBy[p.matchKey] = p;

  const onSave = async (matchKey: string, hs: number, as: number) => { await predict(matchKey, hs, as); };

  const open = MATCHES.filter((m) => nowMs < kickoffEpoch(m));
  const played = MATCHES.filter((m) => nowMs >= kickoffEpoch(m) && predBy[pk(m.a, m.b)]);
  const board = data?.leaderboard || [];

  let curDay = "";
  return (
    <div>
      <TitleBar color={C.m}>PRODE MUNDIAL</TitleBar>

      <div className="tt-row mb-2">
        <span style={{ color: C.c }}>EXACTO +3 · GANADOR/EMPATE +1 · CIERRA AL PITAZO INICIAL</span>
      </div>
      <div className="tt-row mb-3">
        {auth.isLoading ? (
          <span style={{ color: C.dim }}>VERIFICANDO SESION...</span>
        ) : auth.isGuest ? (
          <>
            <span style={{ color: C.y }}>JUGAS COMO INVITADO ({auth.displayName}).</span>
            <SignInWithGoogle className="tt-btn" />
            <span style={{ color: C.dim }} className="text-[.85em]">ENTRA CON GOOGLE PARA QUE TU NOMBRE QUEDE EN LA TABLA</span>
          </>
        ) : (
          <>
            <span style={{ color: C.g }}>HOLA {auth.displayName}</span>
            <button className="tt-btn" onClick={() => signOut()}>SALIR</button>
          </>
        )}
      </div>

      {/* posiciones del prode */}
      {board.length > 0 && (
        <div className="mb-4">
          <Sep color={C.m} label="POSICIONES DEL PRODE" />
          {board.slice(0, 10).map((r, i) => (
            <div key={r.userId} className="tt-row">
              <span style={{ color: C.c }} className="w-6">{i + 1}</span>
              <span style={{ color: r.userId === auth.userId ? C.g : C.y }} className="tt-glow">
                {r.name}{r.userId === auth.userId ? " ◄VOS" : ""}
              </span>
              <span style={{ color: "#fff" }}>{r.pts} PTS</span>
              <span style={{ color: C.dim }}>({r.exact} EXACTOS / {r.played} JUGADOS)</span>
            </div>
          ))}
        </div>
      )}

      {/* tus pronósticos cerrados */}
      {played.length > 0 && (
        <div className="mb-4">
          <Sep color={C.dim} label="TUS PRONOSTICOS CERRADOS" />
          {played.map((m) => (
            <PredRow key={m.d + m.t + m.a} m={m} pred={predBy[pk(m.a, m.b)]} locked idx={idx} nowK={nowK} onSave={onSave} />
          ))}
        </div>
      )}

      {/* partidos abiertos */}
      <Sep color={C.g} label="PRONOSTICA — PARTIDOS ABIERTOS" />
      {open.length === 0 && <div style={{ color: C.dim }}>NO HAY PARTIDOS ABIERTOS.</div>}
      {open.map((m) => {
        const head = m.d !== curDay ? ((curDay = m.d), true) : false;
        return (
          <div key={m.d + m.t + m.a} id={`pred-${slug(pk(m.a, m.b))}`}>
            {head && <div style={{ color: C.c }} className="mt-2">{dayLabel(m.d)}</div>}
            <PredRow m={m} pred={predBy[pk(m.a, m.b)]} locked={false} idx={idx} nowK={nowK} onSave={onSave} />
          </div>
        );
      })}
    </div>
  );
}
