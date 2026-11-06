import Link from "next/link";

export default function NotFound() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeContent: "center", gap: 16, textAlign: "center" }}>
      <h1>Página no encontrada</h1>
      <p className="mut">La dirección no existe o no tienes permiso para verla.</p>
      <p><Link className="btn" href="/">Volver a presupuestos</Link></p>
    </main>
  );
}
