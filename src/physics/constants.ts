/**
 * Physical constants and derived system scales for 2D electrons in a linearly
 * inhomogeneous magnetic field: B(x) = (B0 * x / L) k_hat.
 *
 * Internal working units for crisp numerical conditioning:
 * - Length: nm (1 nm = 1e-9 m)
 * - Time:   ps (1 ps = 1e-12 s)
 * - Energy: meV (1 meV = 1.602176634e-22 J)
 * - Velocity: nm/ps (1 nm/ps = 1e3 m/s)
 */

export const SI = {
  m_e: 9.1093837015e-31, // kg
  e: 1.602176634e-19, // C
  hbar: 1.054571817e-34, // J·s
  meV_to_J: 1.602176634e-22,
} as const;

export const SYSTEM_PARAMS = {
  mRatio: 0.067, // m* / m_e (GaAs 2DEG effective mass)
  B0: 1.65, // T
  L_nm: 16 * Math.PI * Math.PI, // 16π² nm ≈ 157.91367 nm
} as const;

// Effective mass in kg
export const M_STAR_KG = SYSTEM_PARAMS.mRatio * SI.m_e;
export const L_M = SYSTEM_PARAMS.L_nm * 1e-9;

// β = e * B0 / (m* * L) in SI: m^-1 s^-1
export const BETA_SI = (SI.e * SYSTEM_PARAMS.B0) / (M_STAR_KG * L_M);

// β in nm^-1 ps^-1: (1e-9 m / 1e-12 s) -> multiply SI (1/(m·s)) by 1e-9 * 1e-12 = 1e-21
export const BETA_NM_PS = BETA_SI * 1e-21;

// Conversion: Energy (meV) <-> Velocity^2 ((nm/ps)^2)
// E[J] = 0.5 * m*[kg] * (v[nm/ps] * 1e3)^2 = 0.5 * m* * 1e6 * v_nm_ps^2
// E[meV] = (0.5 * m* * 1e6 / meV_to_J) * v_nm_ps^2
export const KINETIC_PREFACTOR_MEV_PER_NMPS2 = (0.5 * M_STAR_KG * 1e6) / SI.meV_to_J;

// Optimal characteristic length scale ℓ₀ = (ħ * L / (e * B0))^(1/3) in meters and nm
export const ELL_OPTIMAL_M = Math.cbrt((SI.hbar * L_M) / (SI.e * SYSTEM_PARAMS.B0));
export const ELL_OPTIMAL_NM = ELL_OPTIMAL_M * 1e9; // ≈ 39.7894 nm

// Conversion between α (nm/ps) and k_y (nm^-1):
// p_y = m* * α = ħ * k_y  =>  k_y[m^-1] = (m* * α[nm/ps] * 1e3) / ħ
// k_y[nm^-1] = k_y[m^-1] * 1e-9 = (m* * 1e-6 / ħ) * α[nm/ps]
export const ALPHA_TO_KY_FACTOR = (M_STAR_KG * 1e-6) / SI.hbar; // (nm^-1) / (nm/ps)
export const KY_TO_ALPHA_FACTOR = 1 / ALPHA_TO_KY_FACTOR; // (nm/ps) / (nm^-1)

// Characteristic energy scale ε₀ = ħ² / (m* ℓ₀²) in meV
export const EPSILON_0_MEV =
  (SI.hbar * SI.hbar) / (M_STAR_KG * ELL_OPTIMAL_M * ELL_OPTIMAL_M * SI.meV_to_J);

export function kineticEnergyToSpeedNmPs(energyMeV: number): number {
  if (energyMeV <= 0) return 0;
  return Math.sqrt(energyMeV / KINETIC_PREFACTOR_MEV_PER_NMPS2);
}

export function speedNmPsToKineticEnergy(vNmPs: number): number {
  return KINETIC_PREFACTOR_MEV_PER_NMPS2 * vNmPs * vNmPs;
}

export function magneticFieldAtX(xNm: number): number {
  return (SYSTEM_PARAMS.B0 * xNm) / SYSTEM_PARAMS.L_nm;
}

export function alphaToKy(alphaNmPs: number): number {
  return alphaNmPs * ALPHA_TO_KY_FACTOR;
}

export function kyToAlpha(kyNmInv: number): number {
  return kyNmInv * KY_TO_ALPHA_FACTOR;
}
