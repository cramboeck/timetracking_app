/** Einheiten-Erkennung aus der sevDesk-Unity-Liste (rein, ohne DB/Netz — testbar). */
export interface SevdeskUnits { hour: number; piece: number; source: 'account' | 'fallback' }

export function pickUnits(objects: Array<{ id?: unknown; name?: unknown; translationCode?: unknown }>): SevdeskUnits {
  const norm = (o: { name?: unknown; translationCode?: unknown }) =>
    `${String(o.name ?? '')} ${String(o.translationCode ?? '')}`.toLowerCase();
  const hour = objects.find(o => /\b(std\.?|stunde|stunden|hour|hours)\b|unity_hour/.test(norm(o)));
  const piece = objects.find(o => /\b(stk\.?|stück|stueck|piece|pieces|pcs)\b|unity_piece/.test(norm(o)));
  const hourId = Number(hour?.id);
  const pieceId = Number(piece?.id);
  return {
    hour: Number.isFinite(hourId) && hourId > 0 ? hourId : 9,
    piece: Number.isFinite(pieceId) && pieceId > 0 ? pieceId : 1,
    source: hour ? 'account' : 'fallback',
  };
}
