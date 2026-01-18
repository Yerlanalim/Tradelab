export type HsMatchResult = {
  level: "match" | "partial" | "mismatch";
  note: string;
};

export function evaluateHsMatch(): HsMatchResult {
  // TODO: заменить на реальную логику сравнения HS-кодов.
  return { level: "partial", note: "Нужна проверка HS-кода." };
}
