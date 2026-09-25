/** 버전 번호 계산 (순수 함수) */
export function bumpVersion(v: string, major = false): string {
  const [ma, mi] = v.split(".").map(Number) as [number, number];
  return major ? `${ma + 1}.0` : `${ma}.${mi + 1}`;
}

export function compareVersion(a: string, b: string): number {
  const [a1, a2] = a.split(".").map(Number) as [number, number];
  const [b1, b2] = b.split(".").map(Number) as [number, number];
  return a1 - b1 || a2 - b2;
}
