import {
  ALPHA_TO_KY_FACTOR,
  ELL_OPTIMAL_NM,
  M_STAR_KG,
  SI,
  BETA_NM_PS,
  kyToAlpha,
} from './constants';

export type MatrixDimension = 360 | 540 | 720 | 900 | 1080;

export interface BandStructurePoint {
  alpha: number; // nm/ps
  ky: number; // nm^-1
  energiesMeV: number[]; // sorted eigenvalues E_0, E_1, ..., E_{maxBand}
  parities: (0 | 1)[]; // 0 = even, 1 = odd
}

export interface DegeneratePoint {
  alpha: number;
  ky: number;
  energyMeV: number;
  bandLow: number;
  bandHigh: number;
  gapMeV: number;
}

export interface EigenstateResult {
  alpha: number;
  ky: number;
  ellNm: number;
  dimension: MatrixDimension;
  energiesMeV: number[];
  parities: (0 | 1)[];
  // Eigenvector coefficients c_k in Hermite-Gaussian basis (full N length, sparse by parity)
  // Stored per band n: coefficients for k = parity, parity+2, ...
  bandCoeffs: Float64Array[];
  expectationX2Nm2: number[];
  expectationX4Nm4: number[];
  groupVelocityNmPs: number[];
}

interface PentadiagonalBlock {
  m: number; // N / 2
  d0: Float64Array;
  d1: Float64Array;
  d2: Float64Array;
}

interface GivensRecord {
  count: number;
  pArr: Int32Array;
  cArr: Float64Array;
  sArr: Float64Array;
}

/**
 * Builds the even (parity=0) or odd (parity=1) decoupled symmetric pentadiagonal
 * block of the Hamiltonian in meV.
 */
function buildParityBlock(
  N: number,
  parity: 0 | 1,
  alphaNmPs: number,
  ellNm: number
): PentadiagonalBlock {
  const m = N >> 1;
  const d0 = new Float64Array(m);
  const d1 = new Float64Array(m);
  const d2 = new Float64Array(m);

  const ellM = ellNm * 1e-9;
  const alphaSI = alphaNmPs * 1e3;
  const betaSI = BETA_NM_PS * 1e21;

  // Energy coefficients in meV
  const E_kin = (SI.hbar * SI.hbar) / (2 * M_STAR_KG * ellM * ellM * SI.meV_to_J);
  const K_y = (0.5 * M_STAR_KG * alphaSI * alphaSI) / SI.meV_to_J;
  const V_1 = (0.5 * M_STAR_KG * alphaSI * betaSI * ellM * ellM) / SI.meV_to_J;
  const V_2 = (0.125 * M_STAR_KG * betaSI * betaSI * Math.pow(ellM, 4)) / SI.meV_to_J;

  for (let i = 0; i < m; i++) {
    const n = 2 * i + parity;
    // Exact diagonal element: <n|xi^4|n> = (3/2)n^2 + (3/2)n + 3/4
    d0[i] =
      (E_kin + V_1) * (n + 0.5) +
      K_y +
      V_2 * (1.5 * n * n + 1.5 * n + 0.75);

    if (i + 1 < m) {
      d1[i] =
        Math.sqrt((n + 1) * (n + 2)) *
        (-0.5 * E_kin + 0.5 * V_1 + (n + 1.5) * V_2);
    }

    if (i + 2 < m) {
      d2[i] =
        0.25 *
        Math.sqrt((n + 1) * (n + 2) * (n + 3) * (n + 4)) *
        V_2;
    }
  }

  return { m, d0, d1, d2 };
}

/**
 * Reduces a symmetric pentadiagonal matrix (d0, d1, d2) in-place to symmetric
 * tridiagonal form (d0, d1) using Rutishauser/Schwarz Givens bulge chasing.
 * Optionally records Givens rotations for eigenvector back-transformation.
 */
function reducePentadiagonalToTridiagonal(
  block: PentadiagonalBlock,
  recordGivens = false
): GivensRecord | null {
  const { m, d0, d1, d2 } = block;
  let maxRot = 0;
  let count = 0;
  let pArr = new Int32Array(0);
  let cArr = new Float64Array(0);
  let sArr = new Float64Array(0);

  if (recordGivens && m >= 3) {
    maxRot = Math.ceil((m * m) / 4) + m;
    pArr = new Int32Array(maxRot);
    cArr = new Float64Array(maxRot);
    sArr = new Float64Array(maxRot);
  }

  for (let k = 0; k < m - 2; k++) {
    let row = k;
    let p = k + 1;
    let q = k + 2;
    let bulge = d2[k];
    d2[k] = 0;

    while (q < m) {
      const y = row === p - 1 ? d1[row] : d2[row];
      const x = bulge;
      const r = Math.sqrt(y * y + x * x);

      if (r === 0) {
        if (row === p - 1) {
          d1[row] = 0;
        } else {
          d2[row] = 0;
        }
        break;
      }

      const c = y / r;
      const s = x / r;

      if (row === p - 1) {
        d1[row] = r;
      } else {
        d2[row] = r;
        // Update row p - 1: (d1[p-1], d2[p-1])
        const uPrev = d1[p - 1];
        const vPrev = d2[p - 1];
        d1[p - 1] = c * uPrev + s * vPrev;
        d2[p - 1] = -s * uPrev + c * vPrev;
      }

      if (recordGivens) {
        pArr[count] = p;
        cArr[count] = c;
        sArr[count] = s;
        count++;
      }

      // Update 2x2 block (p, q)
      const a = d0[p];
      const b = d1[p];
      const d = d0[q];
      const cc = c * c;
      const ss = s * s;
      const cs = c * s;

      d0[p] = cc * a + 2 * cs * b + ss * d;
      d0[q] = ss * a - 2 * cs * b + cc * d;
      d1[p] = (cc - ss) * b + cs * (d - a);

      // Update columns q + 1 and q + 2
      if (q + 1 < m) {
        const u1 = d2[p];
        const v1 = d1[q];
        d2[p] = c * u1 + s * v1;
        d1[q] = -s * u1 + c * v1;
      }

      let nextBulge = 0;
      if (q + 2 < m) {
        const v2 = d2[q];
        nextBulge = s * v2;
        d2[q] = c * v2;
      }

      row = p;
      p = q + 1;
      q = q + 2;
      bulge = nextBulge;
      if (bulge === 0) break;
    }
  }

  return recordGivens ? { count, pArr, cArr, sArr } : null;
}

/**
 * Computes Gershgorin bounds [low, high] for a symmetric tridiagonal matrix.
 */
function tridiagonalBounds(d0: Float64Array, d1: Float64Array, m: number): [number, number] {
  if (m === 0) return [0, 0];
  let low = d0[0] - (m > 1 ? Math.abs(d1[0]) : 0);
  let high = d0[0] + (m > 1 ? Math.abs(d1[0]) : 0);
  for (let i = 1; i < m; i++) {
    const rad = Math.abs(d1[i - 1]) + (i < m - 1 ? Math.abs(d1[i]) : 0);
    if (d0[i] - rad < low) low = d0[i] - rad;
    if (d0[i] + rad > high) high = d0[i] + rad;
  }
  const margin = Math.max(1e-6, (high - low) * 1e-9);
  return [low - margin, high + margin];
}

/**
 * Counts number of eigenvalues strictly less than lambda using Sturm sequence.
 */
function sturmCount(d0: Float64Array, d1: Float64Array, m: number, lambda: number): number {
  let neg = 0;
  let q = d0[0] - lambda;
  if (q < 0) neg++;

  for (let i = 1; i < m; i++) {
    const eSq = d1[i - 1] * d1[i - 1];
    if (q === 0) {
      q = d0[i] - lambda - Math.abs(d1[i - 1]) * 1e12; // handles exact zero pivot stably
      // Fallback safe perturbation:
      q = d0[i] - lambda - eSq / 1e-30;
    } else {
      q = d0[i] - lambda - eSq / q;
    }
    if (q < 0) neg++;
  }
  return neg;
}

/**
 * Finds the k-th (0-indexed) lowest eigenvalues [0 .. kCount-1] of a symmetric
 * tridiagonal matrix via Sturm bisection.
 */
function findLowestEigenvalues(
  d0: Float64Array,
  d1: Float64Array,
  m: number,
  kCount: number
): number[] {
  const actualK = Math.min(kCount, m);
  const [gLow, gHigh] = tridiagonalBounds(d0, d1, m);
  const evals = new Array<number>(actualK);

  let prevLow = gLow;
  for (let k = 0; k < actualK; k++) {
    let lo = prevLow;
    let hi = gHigh;

    // Tighten upper bound slightly using previous eigenvalue knowledge if needed
    for (let iter = 0; iter < 58; iter++) {
      const mid = 0.5 * (lo + hi);
      if (hi - lo <= 1e-13 * (Math.abs(mid) + 1)) break;
      const cnt = sturmCount(d0, d1, m, mid);
      if (cnt <= k) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    const val = 0.5 * (lo + hi);
    evals[k] = val;
    prevLow = lo;
  }

  return evals;
}

/**
 * Computes eigenvector z of symmetric tridiagonal matrix (d0, d1) for eigenvalue lambda
 * via shifted tridiagonal LU with partial pivoting (inverse iteration).
 */
function tridiagonalEigenvector(
  d0: Float64Array,
  d1: Float64Array,
  m: number,
  lambda: number
): Float64Array {
  const z = new Float64Array(m);
  // Deterministic initial vector with non-zero components across indices
  for (let i = 0; i < m; i++) {
    z[i] = 1 / Math.sqrt(m) + 1e-3 * Math.sin((i + 1) * 1.61803398875);
  }

  // Working arrays for LU factorization of (T - lambda * I)
  const diag = new Float64Array(m);
  const sup1 = new Float64Array(m);
  const sup2 = new Float64Array(m);
  const mult = new Float64Array(m);
  const swap = new Uint8Array(m);

  const eps = 1e-14 * (Math.abs(lambda) + 1);
  // Slight perturbation avoids exact singularity during LU solve
  const shift = lambda + eps * 0.5;

  for (let i = 0; i < m; i++) {
    diag[i] = d0[i] - shift;
    sup1[i] = i < m - 1 ? d1[i] : 0;
    sup2[i] = 0;
  }

  // Banded LU with partial pivoting
  for (let i = 0; i < m - 1; i++) {
    const sub = d1[i];
    if (Math.abs(diag[i]) >= Math.abs(sub)) {
      swap[i] = 0;
      const factor = diag[i] === 0 ? 0 : sub / diag[i];
      mult[i] = factor;
      diag[i + 1] -= factor * sup1[i];
    } else {
      swap[i] = 1;
      const factor = diag[i] / sub;
      mult[i] = factor;
      const tmpDiag = diag[i + 1];
      const tmpSup = i + 1 < m - 1 ? d1[i + 1] : 0;
      diag[i] = sub;
      const oldSup1 = sup1[i];
      sup1[i] = tmpDiag;
      sup2[i] = tmpSup;
      diag[i + 1] = oldSup1 - factor * tmpDiag;
      if (i + 1 < m - 1) {
        sup1[i + 1] = -factor * tmpSup;
      }
    }
  }

  // 4 inverse iteration solves
  for (let iter = 0; iter < 4; iter++) {
    // Forward substitution
    for (let i = 0; i < m - 1; i++) {
      if (swap[i]) {
        const tmp = z[i];
        z[i] = z[i + 1];
        z[i + 1] = tmp;
      }
      z[i + 1] -= mult[i] * z[i];
    }

    // Back substitution
    for (let i = m - 1; i >= 0; i--) {
      let sum = z[i];
      if (i + 1 < m) sum -= sup1[i] * z[i + 1];
      if (i + 2 < m) sum -= sup2[i] * z[i + 2];
      const piv = Math.abs(diag[i]) < 1e-15 ? (diag[i] >= 0 ? 1e-15 : -1e-15) : diag[i];
      z[i] = sum / piv;
    }

    // Normalize
    let norm = 0;
    for (let i = 0; i < m; i++) norm += z[i] * z[i];
    norm = Math.sqrt(norm);
    if (norm > 0) {
      for (let i = 0; i < m; i++) z[i] /= norm;
    }
  }

  return z;
}

/**
 * Applies recorded Givens rotations in reverse order: z <- G_1 G_2 ... G_R z
 */
function applyGivensBackTransform(z: Float64Array, givens: GivensRecord): void {
  const { count, pArr, cArr, sArr } = givens;
  for (let idx = count - 1; idx >= 0; idx--) {
    const p = pArr[idx];
    const q = p + 1;
    const c = cArr[idx];
    const s = sArr[idx];
    const zp = z[p];
    const zq = z[q];
    z[p] = c * zp - s * zq;
    z[q] = s * zp + c * zq;
  }
}

/**
 * Solves lowest `maxBand + 1` eigenvalues for a single alpha value.
 */
export function solveEigenvaluesAtAlpha(
  alphaNmPs: number,
  dimension: MatrixDimension,
  ellNm = ELL_OPTIMAL_NM,
  maxBand = 10
): { energiesMeV: number[]; parities: (0 | 1)[] } {
  const perParity = Math.min(maxBand + 2, dimension >> 1);
  const evenBlock = buildParityBlock(dimension, 0, alphaNmPs, ellNm);
  reducePentadiagonalToTridiagonal(evenBlock, false);
  const evenEvals = findLowestEigenvalues(evenBlock.d0, evenBlock.d1, evenBlock.m, perParity);

  const oddBlock = buildParityBlock(dimension, 1, alphaNmPs, ellNm);
  reducePentadiagonalToTridiagonal(oddBlock, false);
  const oddEvals = findLowestEigenvalues(oddBlock.d0, oddBlock.d1, oddBlock.m, perParity);

  const combined: { e: number; p: 0 | 1 }[] = [];
  for (let i = 0; i < evenEvals.length; i++) combined.push({ e: evenEvals[i], p: 0 });
  for (let i = 0; i < oddEvals.length; i++) combined.push({ e: oddEvals[i], p: 1 });

  combined.sort((a, b) => a.e - b.e);
  const count = Math.min(maxBand + 1, combined.length);
  const energiesMeV = new Array<number>(count);
  const parities = new Array<0 | 1>(count);
  for (let i = 0; i < count; i++) {
    energiesMeV[i] = combined[i].e;
    parities[i] = combined[i].p;
  }
  return { energiesMeV, parities };
}

/**
 * Computes full band structure E_n(alpha) across [alphaMin, alphaMax]
 * and detects degenerate band overlap points.
 */
export function computeBandStructure(
  alphaMin: number,
  alphaMax: number,
  numPoints: number,
  dimension: MatrixDimension,
  ellNm = ELL_OPTIMAL_NM,
  maxBand = 10,
  degeneracyThresholdMeV = 0.05
): { points: BandStructurePoint[]; degeneracies: DegeneratePoint[] } {
  const points: BandStructurePoint[] = [];
  const degeneracies: DegeneratePoint[] = [];

  // Build non-uniform alpha grid with ~3x higher point density in negative region (alpha <= 0)
  const alphaGrid: number[] = [];
  if (numPoints <= 1) {
    alphaGrid.push(0.5 * (alphaMin + alphaMax));
  } else if (alphaMin < 0 && alphaMax > 0) {
    const negCount = Math.max(2, Math.round(numPoints * 0.74));
    const posCount = Math.max(1, numPoints - negCount);
    for (let i = 0; i < negCount; i++) {
      const frac = i / (negCount - 1);
      alphaGrid.push(alphaMin + frac * (0 - alphaMin));
    }
    for (let i = 1; i <= posCount; i++) {
      const frac = i / posCount;
      alphaGrid.push(frac * alphaMax);
    }
  } else {
    for (let i = 0; i < numPoints; i++) {
      const frac = i / (numPoints - 1);
      alphaGrid.push(alphaMin + frac * (alphaMax - alphaMin));
    }
  }

  for (let i = 0; i < alphaGrid.length; i++) {
    const alpha = alphaGrid[i];
    const ky = alpha * ALPHA_TO_KY_FACTOR;
    const { energiesMeV, parities } = solveEigenvaluesAtAlpha(alpha, dimension, ellNm, maxBand);
    points.push({ alpha, ky, energiesMeV, parities });

    // Detect adjacent near-degenerate pairs (typically even+odd double-well tunneling doublets)
    for (let b = 0; b + 1 < energiesMeV.length; b++) {
      const gap = Math.abs(energiesMeV[b + 1] - energiesMeV[b]);
      if (gap < degeneracyThresholdMeV) {
        degeneracies.push({
          alpha,
          ky,
          energyMeV: 0.5 * (energiesMeV[b] + energiesMeV[b + 1]),
          bandLow: b,
          bandHigh: b + 1,
          gapMeV: gap,
        });
      }
    }
  }

  return { points, degeneracies };
}

/**
 * Solves lowest `maxBand + 1` eigenvalues AND eigenvectors at a given alpha,
 * plus exact algebraic expectation values <x^2>, <x^4>, and group velocity d<y>/dt.
 */
export function solveEigenstatesAtAlpha(
  alphaNmPs: number,
  dimension: MatrixDimension,
  ellNm = ELL_OPTIMAL_NM,
  maxBand = 10
): EigenstateResult {
  const perParity = Math.min(maxBand + 2, dimension >> 1);

  const evenBlock = buildParityBlock(dimension, 0, alphaNmPs, ellNm);
  const evenD0 = evenBlock.d0;
  const evenD1 = evenBlock.d1;
  const evenGivens = reducePentadiagonalToTridiagonal(evenBlock, true)!;
  const evenEvals = findLowestEigenvalues(evenD0, evenD1, evenBlock.m, perParity);

  const evenVecs = evenEvals.map((ev) => {
    const z = tridiagonalEigenvector(evenD0, evenD1, evenBlock.m, ev);
    applyGivensBackTransform(z, evenGivens);
    // Re-normalize to ensure exact unit norm
    let norm = 0;
    for (let i = 0; i < z.length; i++) norm += z[i] * z[i];
    norm = Math.sqrt(norm);
    if (norm > 0) for (let i = 0; i < z.length; i++) z[i] /= norm;
    return z;
  });

  const oddBlock = buildParityBlock(dimension, 1, alphaNmPs, ellNm);
  const oddD0 = oddBlock.d0;
  const oddD1 = oddBlock.d1;
  const oddGivens = reducePentadiagonalToTridiagonal(oddBlock, true)!;
  const oddEvals = findLowestEigenvalues(oddD0, oddD1, oddBlock.m, perParity);

  const oddVecs = oddEvals.map((ev) => {
    const z = tridiagonalEigenvector(oddD0, oddD1, oddBlock.m, ev);
    applyGivensBackTransform(z, oddGivens);
    let norm = 0;
    for (let i = 0; i < z.length; i++) norm += z[i] * z[i];
    norm = Math.sqrt(norm);
    if (norm > 0) for (let i = 0; i < z.length; i++) z[i] /= norm;
    return z;
  });

  const combined: { e: number; p: 0 | 1; c: Float64Array }[] = [];
  for (let i = 0; i < evenEvals.length; i++) {
    combined.push({ e: evenEvals[i], p: 0, c: evenVecs[i] });
  }
  for (let i = 0; i < oddEvals.length; i++) {
    combined.push({ e: oddEvals[i], p: 1, c: oddVecs[i] });
  }
  combined.sort((a, b) => a.e - b.e);

  const count = Math.min(maxBand + 1, combined.length);
  const energiesMeV: number[] = [];
  const parities: (0 | 1)[] = [];
  const bandCoeffs: Float64Array[] = [];
  const expectationX2Nm2: number[] = [];
  const expectationX4Nm4: number[] = [];
  const groupVelocityNmPs: number[] = [];

  const ell2 = ellNm * ellNm;
  const ell4 = ell2 * ell2;

  for (let b = 0; b < count; b++) {
    const { e, p, c } = combined[b];
    energiesMeV.push(e);
    parities.push(p);
    bandCoeffs.push(c);

    // Compute <xi^2> and <xi^4> exactly from parity-decoupled Hermite coefficients:
    // For basis n = 2i + p, i+1 corresponds to n+2, i+2 corresponds to n+4
    let xi2 = 0;
    let xi4 = 0;
    const m = c.length;
    for (let i = 0; i < m; i++) {
      const n = 2 * i + p;
      const ci = c[i];
      xi2 += ci * ci * (n + 0.5);
      xi4 += ci * ci * (1.5 * n * n + 1.5 * n + 0.75);
      if (i + 1 < m) {
        const ci1 = c[i + 1];
        const s2 = Math.sqrt((n + 1) * (n + 2));
        xi2 += 2 * ci * ci1 * 0.5 * s2;
        xi4 += 2 * ci * ci1 * (n + 1.5) * s2;
      }
      if (i + 2 < m) {
        const ci2 = c[i + 2];
        const s4 = Math.sqrt((n + 1) * (n + 2) * (n + 3) * (n + 4));
        xi4 += 2 * ci * ci2 * 0.25 * s4;
      }
    }

    const x2 = xi2 * ell2;
    const x4 = xi4 * ell4;
    expectationX2Nm2.push(x2);
    expectationX4Nm4.push(x4);
    // Ehrenfest & Hellmann-Feynman: d<y>/dt = alpha + 0.5 * beta * <x^2>
    groupVelocityNmPs.push(alphaNmPs + 0.5 * BETA_NM_PS * x2);
  }

  return {
    alpha: alphaNmPs,
    ky: alphaNmPs * ALPHA_TO_KY_FACTOR,
    ellNm,
    dimension,
    energiesMeV,
    parities,
    bandCoeffs,
    expectationX2Nm2,
    expectationX4Nm4,
    groupVelocityNmPs,
  };
}

/**
 * Evaluates normalized real-space wavefunction psi_n(x) [unit: nm^(-1/2)]
 * over an array of x positions (in nm), using the overflow-free 3-term
 * recurrence for orthonormal Hermite-Gaussian functions.
 */
export function evaluateWavefunction(
  xGridNm: number[],
  coeffs: Float64Array,
  parity: 0 | 1,
  ellNm: number
): Float64Array {
  const psi = new Float64Array(xGridNm.length);
  const invSqrtEll = 1 / Math.sqrt(ellNm);
  const piMinusQuarter = Math.pow(Math.PI, -0.25);
  const maxN = 2 * (coeffs.length - 1) + parity;

  // Trim trailing negligible coefficients for faster grid evaluation while keeping machine precision
  let lastActive = coeffs.length - 1;
  while (lastActive > 0 && Math.abs(coeffs[lastActive]) < 1e-13) {
    lastActive--;
  }
  const activeMaxN = 2 * lastActive + parity;

  for (let gx = 0; gx < xGridNm.length; gx++) {
    const xi = xGridNm[gx] / ellNm;
    const expFactor = Math.exp(-0.5 * xi * xi);
    if (expFactor < 1e-20 && Math.abs(xi) > Math.sqrt(2 * activeMaxN + 1) + 10) {
      psi[gx] = 0;
      continue;
    }

    let phiPrev = 0;
    let phiCurr = piMinusQuarter * expFactor; // n = 0
    let sum = 0;

    if (parity === 0) {
      sum += coeffs[0] * phiCurr;
    }

    const limit = Math.min(maxN, activeMaxN);
    for (let k = 1; k <= limit; k++) {
      const phiNext =
        Math.sqrt(2 / k) * xi * phiCurr -
        (k > 1 ? Math.sqrt((k - 1) / k) * phiPrev : 0);
      phiPrev = phiCurr;
      phiCurr = phiNext;

      if ((k & 1) === parity) {
        const idx = (k - parity) >> 1;
        sum += coeffs[idx] * phiCurr;
      }

      // Guard against underflow/overflow at extreme tails
      if (!Number.isFinite(phiCurr)) break;
    }

    psi[gx] = sum * invSqrtEll;
  }

  return psi;
}

export { kyToAlpha };
