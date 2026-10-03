/** Small combinatorial helpers used by the vendored reduction solver. */
export const Cnk = Array.from({ length: 32 }, (_, n) => {
  const row = Array<number>(32).fill(0);
  row[0] = 1;
  for (let k = 1; k <= n; k++) row[k] = (row[k - 1] * (n - k + 1)) / k;
  return row;
});

export function circle(values: number[], ...positions: number[]) {
  const previous = positions.map((position) => values[position]);
  positions.forEach((position, index) => {
    values[position] =
      previous[(index + positions.length - 1) % positions.length];
  });
  return circle;
}

/** Decode the lexicographic rank of a permutation of eight elements. */
export function set8Perm(output: number[], rank: number) {
  const unused = Array.from({ length: 8 }, (_, i) => i);
  let divisor = 5040;
  for (let i = 0; i < 8; i++) {
    const index = Math.floor(rank / divisor);
    output[i] = unused.splice(index, 1)[0];
    rank %= divisor;
    divisor /= Math.max(1, 7 - i);
  }
  return output;
}
