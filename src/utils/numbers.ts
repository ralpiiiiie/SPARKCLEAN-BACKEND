export function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : Number(value);
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
