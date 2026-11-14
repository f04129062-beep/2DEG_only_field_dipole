import {
  BETA_NM_PS,
  KINETIC_PREFACTOR_MEV_PER_NMPS2,
  kineticEnergyToSpeedNmPs,
  magneticFieldAtX,
} from './constants';

export interface ClassicalInitialConditions {
  energyMeV: number; // 0 ~ 25 meV
  angleDeg: number; // -180 ~ 180 deg
  x0Nm: number; // -120 ~ 120 nm
  y0Nm: number; // -100 ~ 100 nm
}

export interface TrajectoryPoint {
  t: number; // ps
  x: number; // nm
  y: number; // nm
  vx: number; // nm/ps
  vy: number; // nm/ps
  ax: number; // nm/ps^2
  B: number; // Tesla
  kineticMeV: number;
  potentialMeV: number;
}

export interface ClassicalSummary {
  v0: number; // nm/ps
  alpha: number; // nm/ps
  beta: number; // nm^-1 ps^-1
  D: number; // dimensionless discriminant α / v0
  turningPointsX: number[]; // sorted turning points in nm
  hasInnerTurningPoint: boolean;
  analyticalDeltaY: number | null; // nm per x-period (from elliptic integrals)
  numericalPeriodT: number | null; // ps
  regime: 'field-gradient' | 'slow-snake' | 'infinity' | 'snake' | 'wide' | 'static';
  regimeLabel: string;
}

export interface ClassicalPreset {
  id: string;
  label: string;
  description: string;
  conditions: ClassicalInitialConditions;
}

// Compute D = -0.6522296... accurately
export const INFINITY_D = -0.6522295958;

export const CLASSICAL_PRESETS: ClassicalPreset[] = [
  {
    id: 'field-gradient',
    label: '場梯度漂移',
    description: 'D < −1：動能低於中央勢壘，電子受限於單側磁場區進行 ∇B 單向漂移，不跨越 x = 0。',
    conditions: {
      energyMeV: 6,
      angleDeg: -90,
      x0Nm: 95,
      y0Nm: 0,
    },
  },
  {
    id: 'snake',
    label: '蛇形態',
    description: '−0.65223 < D < 0：粒子反覆穿越 B = 0 零磁場線，形成具自交環結且向 +y 推進的蛇行軌跡。',
    conditions: {
      energyMeV: 12,
      angleDeg: -20,
      x0Nm: 0,
      y0Nm: 0,
    },
  },
  {
    id: 'wide',
    label: '寬幅蛇行',
    description: 'D > 0：單勢阱寬幅振盪，電子高速向 +y 方向漂移，x 方向擺幅寬廣。',
    conditions: {
      energyMeV: 22,
      angleDeg: 25,
      x0Nm: 0,
      y0Nm: 0,
    },
  },
  {
    id: 'slow-snake',
    label: '交叉緩步蛇行',
    description: '−1 < D < −0.65223：跨過零磁場線但回繞弧度大於前進量，產生淨 −y 緩慢反向漂移。',
    conditions: {
      energyMeV: 12,
      angleDeg: -55,
      x0Nm: 0,
      y0Nm: 0,
    },
  },
  {
    id: 'infinity',
    label: '∞ 型封閉軌跡',
    description: 'D ≈ −0.65223：正負 y 漂移完全抵消 (Δy = 0)，形成穩定封閉的 8 字型 (∞) 週期軌道。',
    conditions: {
      energyMeV: 12,
      angleDeg: -40.71,
      x0Nm: 0,
      y0Nm: 0,
    },
  },
];

/**
 * Complete elliptic integrals K(m) and E(m) for m <= 1 (including m < 0)
 * via Arithmetic-Geometric Mean (AGM) and Landen transformation.
 * Note: For m < 0, let m = -k^2, mu = -m / (1 - m) in (0, 1).
 * K(m) = (1 / sqrt(1 - m)) * K(mu)
 * E(m) = sqrt(1 - m) * E(mu)
 */
export function ellipticKE(m: number): { K: number; E: number } {
  if (m < 0) {
    const oneMinusM = 1 - m;
    const sqrtOneMinusM = Math.sqrt(oneMinusM);
    const mu = -m / oneMinusM;
    const { K: Kmu, E: Emu } = ellipticKEPositive(mu);
    return {
      K: Kmu / sqrtOneMinusM,
      E: sqrtOneMinusM * Emu,
    };
  }
  return ellipticKEPositive(m);
}

function ellipticKEPositive(m: number): { K: number; E: number } {
  if (m >= 1) {
    return { K: Infinity, E: 1 };
  }
  if (m === 0) {
    return { K: Math.PI / 2, E: Math.PI / 2 };
  }
  let a = 1;
  let b = Math.sqrt(1 - m);
  let sum = 0;
  let pow2 = 1;

  for (let i = 0; i < 30; i++) {
    const c = (a - b) / 2;
    sum += pow2 * c * c;
    const aNext = (a + b) / 2;
    const bNext = Math.sqrt(a * b);
    a = aNext;
    b = bNext;
    pow2 *= 2;
    if (Math.abs(a - b) < 1e-14) break;
  }

  const K = Math.PI / (2 * a);
  const E = K * (1 - m / 2 - sum);
  return { K, E };
}

export function effectivePotentialMeV(xNm: number, alphaNmPs: number): number {
  const vy = alphaNmPs + 0.5 * BETA_NM_PS * xNm * xNm;
  return KINETIC_PREFACTOR_MEV_PER_NMPS2 * vy * vy;
}

export function analyzeClassicalSystem(ic: ClassicalInitialConditions): ClassicalSummary {
  const v0 = kineticEnergyToSpeedNmPs(ic.energyMeV);
  const rad = (ic.angleDeg * Math.PI) / 180;
  const vy0 = v0 * Math.sin(rad);
  const alpha = vy0 - 0.5 * BETA_NM_PS * ic.x0Nm * ic.x0Nm;

  if (v0 < 1e-9) {
    return {
      v0: 0,
      alpha,
      beta: BETA_NM_PS,
      D: 0,
      turningPointsX: [ic.x0Nm],
      hasInnerTurningPoint: false,
      analyticalDeltaY: 0,
      numericalPeriodT: null,
      regime: 'static',
      regimeLabel: '靜止狀態 (E = 0)',
    };
  }

  const D = alpha / v0;
  const xmOuter = Math.sqrt(Math.max(0, (2 * v0 * (1 - D)) / BETA_NM_PS));

  let turningPointsX: number[] = [];
  let hasInnerTurningPoint = false;
  let analyticalDeltaY: number | null = null;

  if (D < -1 - 1e-7) {
    hasInnerTurningPoint = true;
    const xmInner = Math.sqrt(Math.max(0, (2 * v0 * (-1 - D)) / BETA_NM_PS));
    if (ic.x0Nm >= 0) {
      turningPointsX = [xmInner, xmOuter];
    } else {
      turningPointsX = [-xmOuter, -xmInner];
    }
    // Single-well elliptical drift integral can also be evaluated numerically if needed
    analyticalDeltaY = null;
  } else {
    turningPointsX = [-xmOuter, xmOuter];
    if (1 + D > 1e-9) {
      const m = -(1 - D) / (1 + D);
      const { K, E } = ellipticKE(m);
      const prefactor = 4 * Math.sqrt((2 * v0) / BETA_NM_PS) / Math.sqrt(1 + D);
      analyticalDeltaY = prefactor * ((1 + D) * E - K);
    }
  }

  let regime: ClassicalSummary['regime'] = 'snake';
  let regimeLabel = '蛇形態';
  if (D < -1 - 1e-4) {
    regime = 'field-gradient';
    regimeLabel = '場梯度漂移 (單側束縛)';
  } else if (Math.abs(D - INFINITY_D) < 0.015) {
    regime = 'infinity';
    regimeLabel = '∞ 型封閉軌道';
  } else if (D < INFINITY_D) {
    regime = 'slow-snake';
    regimeLabel = '交叉緩步蛇行 (反向漂移)';
  } else if (D < 0) {
    regime = 'snake';
    regimeLabel = '蛇形態 (正向漂移)';
  } else {
    regime = 'wide';
    regimeLabel = '寬幅蛇行 (單勢阱)';
  }

  return {
    v0,
    alpha,
    beta: BETA_NM_PS,
    D,
    turningPointsX,
    hasInnerTurningPoint,
    analyticalDeltaY,
    numericalPeriodT: null,
    regime,
    regimeLabel,
  };
}

/**
 * High-accuracy 4th-order Runge-Kutta integration for:
 * dx/dt = vx
 * dvx/dt = -alpha * beta * x - 0.5 * beta^2 * x^3
 * dy/dt = alpha + 0.5 * beta * x^2
 */
export function integrateTrajectory(
  ic: ClassicalInitialConditions,
  tMaxPs = 18,
  dtPs = 0.005
): { points: TrajectoryPoint[]; periodT: number | null } {
  const v0 = kineticEnergyToSpeedNmPs(ic.energyMeV);
  const rad = (ic.angleDeg * Math.PI) / 180;
  let x = ic.x0Nm;
  let y = ic.y0Nm;
  let vx = v0 * Math.cos(rad);
  const vy0 = v0 * Math.sin(rad);
  const alpha = vy0 - 0.5 * BETA_NM_PS * x * x;
  const beta = BETA_NM_PS;
  const totalEnergyMeV = ic.energyMeV;

  const axFn = (xp: number) => -alpha * beta * xp - 0.5 * beta * beta * xp * xp * xp;
  const vyFn = (xp: number) => alpha + 0.5 * beta * xp * xp;

  const steps = Math.max(1, Math.round(tMaxPs / dtPs));
  const points: TrajectoryPoint[] = new Array(steps + 1);

  const makePoint = (t: number, xp: number, yp: number, vxp: number): TrajectoryPoint => {
    const vyp = vyFn(xp);
    const pot = KINETIC_PREFACTOR_MEV_PER_NMPS2 * vyp * vyp;
    const kin = KINETIC_PREFACTOR_MEV_PER_NMPS2 * (vxp * vxp + vyp * vyp);
    return {
      t,
      x: xp,
      y: yp,
      vx: vxp,
      vy: vyp,
      ax: axFn(xp),
      B: magneticFieldAtX(xp),
      kineticMeV: kin,
      potentialMeV: pot,
    };
  };

  points[0] = makePoint(0, x, y, vx);

  // Track turning points to estimate x-oscillation period T
  const extremaTimes: number[] = [];
  let prevVx = vx;

  for (let i = 1; i <= steps; i++) {
    const t = i * dtPs;

    const k1x = vx;
    const k1v = axFn(x);
    const k1y = vyFn(x);

    const x2 = x + 0.5 * dtPs * k1x;
    const vx2 = vx + 0.5 * dtPs * k1v;
    const k2x = vx2;
    const k2v = axFn(x2);
    const k2y = vyFn(x2);

    const x3 = x + 0.5 * dtPs * k2x;
    const vx3 = vx + 0.5 * dtPs * k2v;
    const k3x = vx3;
    const k3v = axFn(x3);
    const k3y = vyFn(x3);

    const x4 = x + dtPs * k3x;
    const vx4 = vx + dtPs * k3v;
    const k4x = vx4;
    const k4v = axFn(x4);
    const k4y = vyFn(x4);

    x += (dtPs / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);
    vx += (dtPs / 6) * (k1v + 2 * k2v + 2 * k3v + k4v);
    y += (dtPs / 6) * (k1y + 2 * k2y + 2 * k3y + k4y);

    // Optional gentle energy projection if numerical drift ever exceeds 1e-9
    if (totalEnergyMeV > 0) {
      const vyp = vyFn(x);
      const speedSq = vx * vx + vyp * vyp;
      const targetSq = v0 * v0;
      if (Math.abs(speedSq - targetSq) > 1e-6 * targetSq && vyp * vyp <= targetSq) {
        const sign = vx >= 0 ? 1 : -1;
        vx = sign * Math.sqrt(Math.max(0, targetSq - vyp * vyp));
      }
    }

    if ((prevVx > 0 && vx <= 0) || (prevVx < 0 && vx >= 0)) {
      extremaTimes.push(t);
    }
    prevVx = vx;

    points[i] = makePoint(t, x, y, vx);
  }

  let periodT: number | null = null;
  if (extremaTimes.length >= 3) {
    periodT = extremaTimes[2] - extremaTimes[0];
  }

  return { points, periodT };
}

export function interpolatePointAtTime(points: TrajectoryPoint[], t: number): TrajectoryPoint {
  if (points.length === 0) {
    return { t: 0, x: 0, y: 0, vx: 0, vy: 0, ax: 0, B: 0, kineticMeV: 0, potentialMeV: 0 };
  }
  if (t <= points[0].t) return points[0];
  const last = points[points.length - 1];
  if (t >= last.t) return last;

  const dt = points[1].t - points[0].t;
  const idxFloat = t / dt;
  const idx = Math.min(points.length - 2, Math.max(0, Math.floor(idxFloat)));
  const frac = idxFloat - idx;
  const p0 = points[idx];
  const p1 = points[idx + 1];

  return {
    t: p0.t + frac * (p1.t - p0.t),
    x: p0.x + frac * (p1.x - p0.x),
    y: p0.y + frac * (p1.y - p0.y),
    vx: p0.vx + frac * (p1.vx - p0.vx),
    vy: p0.vy + frac * (p1.vy - p0.vy),
    ax: p0.ax + frac * (p1.ax - p0.ax),
    B: p0.B + frac * (p1.B - p0.B),
    kineticMeV: p0.kineticMeV + frac * (p1.kineticMeV - p0.kineticMeV),
    potentialMeV: p0.potentialMeV + frac * (p1.potentialMeV - p0.potentialMeV),
  };
}

/**
 * Generates an electron beam of multiple trajectories around the central initial condition
 * with small angular divergence (±6°) and slight spatial spread (±4 nm).
 */
export function integrateElectronBeam(
  ic: ClassicalInitialConditions,
  tMaxPs = 18,
  dtPs = 0.015,
  beamCount = 9
): TrajectoryPoint[][] {
  const half = Math.floor(beamCount / 2);
  const spreadDeg = 6; // ±6 deg angular divergence
  const trajectories: TrajectoryPoint[][] = [];
  for (let i = -half; i <= half; i++) {
    const frac = half > 0 ? i / half : 0;
    const beamIc: ClassicalInitialConditions = {
      ...ic,
      angleDeg: ic.angleDeg + frac * spreadDeg,
      x0Nm: ic.x0Nm + frac * 3.5,
    };
    trajectories.push(integrateTrajectory(beamIc, tMaxPs, dtPs).points);
  }
  return trajectories;
}
