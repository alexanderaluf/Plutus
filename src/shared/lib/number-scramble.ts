const GLYPHS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function hasPrivateNumber(text: string) {
  return /[\p{N}•]/u.test(text);
}

export function maskPrivateNumbers(text: string) {
  return text.replace(/\p{N}/gu, "•");
}

export function scrambleSeed(id: string) {
  let seed = 7;
  for (let index = 0; index < id.length; index++) {
    seed = (seed * 31 + id.charCodeAt(index)) % 65521;
  }
  return seed;
}

/** No original value is used when hiding: every numeric slot scrambles immediately. */
export function numberScrambleFrame(
  target: string,
  progress: number,
  seed: number,
) {
  "worklet";
  if (progress >= 1) return target;
  const characters = Array.from(target);
  let slot = 0;
  const count = characters.filter((character) =>
    /[\p{N}•]/u.test(character),
  ).length;
  const tick = Math.floor(Math.max(0, progress) * 28);
  return characters
    .map((character) => {
      if (!/[\p{N}•]/u.test(character)) return character;
      const position = slot++;
      const variation = (seed * 17 + position * 43) % 101;
      const settle =
        0.42 + (position / Math.max(1, count)) * 0.32 + variation / 500;
      if (progress >= settle) return character;
      const offset =
        (seed + position * 13 + tick * (7 + (position % 5))) % GLYPHS.length;
      return GLYPHS[offset];
    })
    .join("");
}

export type NumberRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function isVisibleNumber(
  rect: NumberRect,
  width: number,
  height: number,
) {
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.x < width &&
    rect.y < height &&
    rect.x + rect.width > 0 &&
    rect.y + rect.height > 0
  );
}
