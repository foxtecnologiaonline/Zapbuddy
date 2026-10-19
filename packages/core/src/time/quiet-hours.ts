/**
 * Janela de silêncio em horas locais (0-23). Janela que cruza a meia-noite
 * (ex.: 22h → 7h) é o caso comum. start === end significa "sem janela".
 */
export function isWithinQuietHours(localHour: number, startHour: number, endHour: number): boolean {
  if (startHour === endHour) return false;
  if (startHour < endHour) return localHour >= startHour && localHour < endHour;
  return localHour >= startHour || localHour < endHour;
}
