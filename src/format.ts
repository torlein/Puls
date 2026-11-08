/** Tall med desimalkomma, slik det skrives på norsk. */
export function num(value: number, decimals = 0): string {
  return value.toFixed(decimals).replace('.', ',');
}

export function bp(sys: number, dia: number): string {
  return `${Math.round(sys)}/${Math.round(dia)}`;
}

/** Runder til nærmeste partall, slik blodtrykk leses av på et manometer. */
export function even(value: number): number {
  return Math.round(value / 2) * 2;
}
