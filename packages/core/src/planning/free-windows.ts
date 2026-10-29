/** Janelas livres entre compromissos (puro, em milissegundos). Quem chama converte pro fuso da pessoa. */
export interface BusyBlock {
  startMs: number;
  endMs: number;
}

export interface FreeWindow {
  startMs: number;
  endMs: number;
  minutes: number;
}

export function computeFreeWindows(busy: BusyBlock[], fromMs: number, toMs: number, minMinutes = 30): FreeWindow[] {
  if (toMs <= fromMs) return [];

  const merged: BusyBlock[] = [];
  for (const block of [...busy].filter((b) => b.endMs > b.startMs).sort((a, b) => a.startMs - b.startMs)) {
    const last = merged.at(-1);
    if (last && block.startMs <= last.endMs) last.endMs = Math.max(last.endMs, block.endMs);
    else merged.push({ ...block });
  }

  const windows: FreeWindow[] = [];
  let cursor = fromMs;
  const push = (startMs: number, endMs: number) => {
    const minutes = Math.floor((endMs - startMs) / 60_000);
    if (minutes >= minMinutes) windows.push({ startMs, endMs, minutes });
  };

  for (const block of merged) {
    if (block.endMs <= cursor) continue;
    if (block.startMs >= toMs) break;
    if (block.startMs > cursor) push(cursor, Math.min(block.startMs, toMs));
    cursor = Math.max(cursor, block.endMs);
  }
  if (cursor < toMs) push(cursor, toMs);
  return windows;
}
