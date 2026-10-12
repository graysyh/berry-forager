// Python's `random` module, bit for bit: MT19937 seeded the way CPython
// seeds it, and the same derived methods (random, getrandbits, _randbelow,
// randrange, randint, choice, shuffle, uniform) built the same way.
//
// Why bother: with the same seed, the web build draws the same bushes,
// jitters and travel times as the PsychoPy task, so the two can be checked
// against each other directly and a seed reproduces a session in either.

const N = 624, M = 397;
const MATRIX_A = 0x9908b0df, UPPER = 0x80000000, LOWER = 0x7fffffff;

export class PyRandom {
  constructor(seed = 0) {
    this.mt = new Uint32Array(N);
    this.mti = N + 1;
    this.seed(seed);
  }

  // random.seed(int): the absolute value, split into 32-bit words
  // little-endian, fed to init_by_array.
  seed(n) {
    let a = BigInt(n);
    if (a < 0n) a = -a;
    const key = [];
    while (a > 0n) { key.push(Number(a & 0xffffffffn)); a >>= 32n; }
    if (key.length === 0) key.push(0);
    this._initByArray(key);
  }

  _initGenrand(s) {
    const mt = this.mt;
    mt[0] = s >>> 0;
    for (let i = 1; i < N; i++) {
      const p = mt[i - 1] ^ (mt[i - 1] >>> 30);
      mt[i] = (Math.imul(1812433253, p) + i) >>> 0;
    }
    this.mti = N;
  }

  _initByArray(key) {
    const mt = this.mt;
    this._initGenrand(19650218);
    let i = 1, j = 0;
    for (let k = Math.max(N, key.length); k > 0; k--) {
      const p = mt[i - 1] ^ (mt[i - 1] >>> 30);
      mt[i] = ((mt[i] ^ Math.imul(p, 1664525)) + key[j] + j) >>> 0;
      i++; j++;
      if (i >= N) { mt[0] = mt[N - 1]; i = 1; }
      if (j >= key.length) j = 0;
    }
    for (let k = N - 1; k > 0; k--) {
      const p = mt[i - 1] ^ (mt[i - 1] >>> 30);
      mt[i] = ((mt[i] ^ Math.imul(p, 1566083941)) - i) >>> 0;
      i++;
      if (i >= N) { mt[0] = mt[N - 1]; i = 1; }
    }
    mt[0] = 0x80000000;
  }

  _genrand() {
    const mt = this.mt;
    let y;
    if (this.mti >= N) {
      let kk;
      for (kk = 0; kk < N - M; kk++) {
        y = (mt[kk] & UPPER) | (mt[kk + 1] & LOWER);
        mt[kk] = mt[kk + M] ^ (y >>> 1) ^ (y & 1 ? MATRIX_A : 0);
      }
      for (; kk < N - 1; kk++) {
        y = (mt[kk] & UPPER) | (mt[kk + 1] & LOWER);
        mt[kk] = mt[kk + (M - N)] ^ (y >>> 1) ^ (y & 1 ? MATRIX_A : 0);
      }
      y = (mt[N - 1] & UPPER) | (mt[0] & LOWER);
      mt[N - 1] = mt[M - 1] ^ (y >>> 1) ^ (y & 1 ? MATRIX_A : 0);
      this.mti = 0;
    }
    y = mt[this.mti++];
    y ^= y >>> 11;
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= y >>> 18;
    return y >>> 0;
  }

  random() {
    const a = this._genrand() >>> 5, b = this._genrand() >>> 6;
    return (a * 67108864 + b) / 9007199254740992;
  }

  getrandbits(k) {            // k <= 32, all this task ever needs
    if (k <= 0) return 0;
    return this._genrand() >>> (32 - k);
  }

  _randbelow(n) {
    const k = 32 - Math.clz32(n);
    let r = this.getrandbits(k);
    while (r >= n) r = this.getrandbits(k);
    return r;
  }

  randrange(start, stop) {
    if (stop === undefined) { stop = start; start = 0; }
    return start + this._randbelow(stop - start);
  }

  randint(a, b) { return this.randrange(a, b + 1); }

  choice(seq) { return seq[this._randbelow(seq.length)]; }

  shuffle(x) {
    for (let i = x.length - 1; i > 0; i--) {
      const j = this._randbelow(i + 1);
      const t = x[i]; x[i] = x[j]; x[j] = t;
    }
  }

  uniform(a, b) { return a + (b - a) * this.random(); }
}

// A fresh, unpredictable seed when the session form leaves it blank —
// random.SystemRandom().randrange(2 ** 31) in the Python task.
export function systemSeed() {
  const u = new Uint32Array(1);
  crypto.getRandomValues(u);
  return u[0] & 0x7fffffff;
}
