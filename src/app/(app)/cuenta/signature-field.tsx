"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import SignaturePad from "signature_pad";
import { ConfirmButton } from "@/components/action-form";
import { deleteSignatureAction, saveSignatureAction } from "@/modules/account/actions";

const INK = "#1b2a6b";

/** The drawn strokes cropped to their bounding box (4 px of air), as a transparent PNG data URL. */
function trimmed(canvas: HTMLCanvasElement): string {
  const { width: w, height: h } = canvas;
  const data = canvas.getContext("2d")!.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (data[(y * w + x) * 4 + 3]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const out = document.createElement("canvas");
  out.width = x1 - x0 + 9;
  out.height = y1 - y0 + 9;
  out.getContext("2d")!.drawImage(canvas, x0 - 4, y0 - 4, out.width, out.height, 0, 0, out.width, out.height);
  return out.toDataURL("image/png");
}

/** «Firma» of Mi cuenta: the stamp with the saved signature; a click opens the window to draw it. */
export function SignatureField({ signature, sello }: { signature: string | null; sello: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const pad = useRef<SignaturePad | null>(null);
  const [drawn, setDrawn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Sizes the canvas to its box at ≥ 2× resolution (sharp strokes), within the 4000×2000 the server accepts, and clears it.
  const fit = () => {
    const c = canvas.current!, r = c.getBoundingClientRect();
    const k = Math.min(Math.max(devicePixelRatio || 1, 2), 4000 / r.width, 2000 / r.height);
    c.width = r.width * k;
    c.height = r.height * k;
    c.getContext("2d")!.setTransform(k, 0, 0, k, 0, 0);
    pad.current!.clear();
    setDrawn(false);
  };

  useEffect(() => {
    const p = new SignaturePad(canvas.current!, { penColor: INK, minWidth: 0.9, maxWidth: 3.4, velocityFilterWeight: 0.7, throttle: 0 });
    p.addEventListener("endStroke", () => setDrawn(true));
    pad.current = p;
    return () => p.off();
  }, []);

  const open = () => { setError(null); dialog.current!.showModal(); fit(); };
  const confirm = () => start(async () => {
    const r = await saveSignatureAction(trimmed(canvas.current!));
    if (r.ok) dialog.current!.close();
    else setError(Object.values(r.errors).join(" · "));
  });

  return (
    <div className="sheet stack">
      <h2 style={{ margin: 0 }}>Firma</h2>
      <p className="mut" style={{ fontSize: 13 }}>Sale sobre el sello en los presupuestos que emitas. Sin firma no se puede emitir.</p>
      <button type="button" className="sigthumb" onClick={open} aria-haspopup="dialog" aria-label={signature ? "Cambiar la firma" : "Firmar"}>
        {signature ? (
          <span className="signed">
            <img className="sello" src={sello} alt="" />
            <img className="firma" src={`data:image/png;base64,${signature}`} alt="" />
          </span>
        ) : <span className="mut">Sin firma. Pulsa para firmar.</span>}
      </button>
      {signature && (
        <form className="sigdel" action={async () => {
          const r = await deleteSignatureAction();
          setDeleteError(r.ok ? null : Object.values(r.errors).join(" · "));
        }}>
          <ConfirmButton label="Eliminar firma" confirm="Sin firma no podrás emitir presupuestos. Los ya emitidos conservan la suya." />
          {deleteError && <p className="err" role="alert">{deleteError}</p>}
        </form>
      )}

      <dialog ref={dialog} className="sign" aria-labelledby="sign-title">
        <div className="bar">
          <h2 id="sign-title">Firma</h2>
          <button type="button" className="btn" onClick={fit}>Borrar</button>
          <button type="button" className="btn pri" onClick={confirm} disabled={!drawn || pending}>Confirmar</button>
          <button type="button" className="x" onClick={() => dialog.current!.close()} aria-label="Cancelar">✕</button>
        </div>
        <div className="area">
          <canvas ref={canvas} className="pad" />
          <span className="base">Firma aquí, con ratón, dedo o lápiz</span>
          {error && <p className="err" role="alert">{error}</p>}
        </div>
      </dialog>
    </div>
  );
}
