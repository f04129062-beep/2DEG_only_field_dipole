import { useCallback, useMemo, useState } from 'react';
import {
  ALPHA_TO_KY_FACTOR,
  BETA_NM_PS,
  ELL_OPTIMAL_NM,
  SYSTEM_PARAMS,
  kyToAlpha,
} from '../physics/constants';
import { effectivePotentialMeV } from '../physics/classical';
import {
  MatrixDimension,
  computeBandStructure,
  evaluateWavefunction,
  solveEigenstatesAtAlpha,
} from '../physics/quantum';
import { downloadCsv } from '../utils/export';
import { MathBlock } from './MathBlock';
import { DrawContext, ScientificCanvas, ViewportBounds } from './ScientificCanvas';

type QuantumSubTab = 'bands' | 'wavefunction' | 'eom';
type XAxisMode = 'alpha' | 'ky';
type BandCountOption = 0 | 1 | 3 | 7 | 10;

const DIMENSIONS: MatrixDimension[] = [360, 540, 720, 900, 1080];
const BAND_OPTIONS: { value: BandCountOption; label: string }[] = [
  { value: 0, label: 'n = 0' },
  { value: 1, label: 'n = 0...1' },
  { value: 3, label: 'n = 0...3' },
  { value: 7, label: 'n = 0...7' },
  { value: 10, label: 'n = 0...10' },
];

const BAND_COLORS = [
  '#1d4ed8', // n=0 cobalt
  '#0d9488', // n=1 teal
  '#7c3aed', // n=2 violet
  '#d97706', // n=3 amber
  '#dc2626', // n=4 crimson
  '#0284c7', // n=5 sky
  '#059669', // n=6 emerald
  '#9333ea', // n=7 purple
  '#ea580c', // n=8 orange
  '#be123c', // n=9 rose
  '#334155', // n=10 slate
];

const ALPHA_MIN_DEFAULT = -320;
const ALPHA_MAX_DEFAULT = 220;
const BAND_SAMPLES = 135;

export function QuantumTab() {
  const [subTab, setSubTab] = useState<QuantumSubTab>('bands');
  const [xAxisMode, setXAxisMode] = useState<XAxisMode>('alpha');

  // Diagonalization parameters
  const [dimension, setDimension] = useState<MatrixDimension>(540);
  const [ellNm, setEllNm] = useState<number>(Number(ELL_OPTIMAL_NM.toFixed(2)));
  const [maxBand, setMaxBand] = useState<BandCountOption>(7);

  // Band structure visual options
  const [connectPoints, setConnectPoints] = useState<boolean>(true);
  const [drawDiscretePoints, setDrawDiscretePoints] = useState<boolean>(true);
  const [highlightDegeneracy, setHighlightDegeneracy] = useState<boolean>(true);
  const [pointSize, setPointSize] = useState<number>(3);

  // Wavefunction & momentum state
  const [selectedBand, setSelectedBand] = useState<number>(0);
  const [alphaNmPs, setAlphaNmPs] = useState<number>(-180);
  const [showProbDensity, setShowProbDensity] = useState<boolean>(true);

  // Manual scale overrides for Band Structure
  const [bandScaleEnabled, setBandScaleEnabled] = useState<boolean>(false);
  const [bandXMinInput, setBandXMinInput] = useState<string>('-320');
  const [bandXMaxInput, setBandXMaxInput] = useState<string>('220');
  const [bandEMinInput, setBandEMinInput] = useState<string>('0');
  const [bandEMaxInput, setBandEMaxInput] = useState<string>('30');

  // Manual scale overrides for Wavefunction E-x plot
  const [wfScaleEnabled, setWfScaleEnabled] = useState<boolean>(false);
  const [wfXMinInput, setWfXMinInput] = useState<string>('-300');
  const [wfXMaxInput, setWfXMaxInput] = useState<string>('300');
  const [wfEMinInput, setWfEMinInput] = useState<string>('-2');
  const [wfEMaxInput, setWfEMaxInput] = useState<string>('28');
  const [psiScale, setPsiScale] = useState<number>(16);

  // Ensure selectedBand stays <= maxBand when band count changes
  const activeSelectedBand = Math.min(selectedBand, maxBand);

  // Compute Band Structure E_n(alpha)
  const bandData = useMemo(() => {
    return computeBandStructure(
      ALPHA_MIN_DEFAULT,
      ALPHA_MAX_DEFAULT,
      BAND_SAMPLES,
      dimension,
      ellNm,
      maxBand,
      0.06
    );
  }, [dimension, ellNm, maxBand]);

  // Compute Eigenstates & Wavefunction at current alphaNmPs
  const eigenResult = useMemo(() => {
    return solveEigenstatesAtAlpha(alphaNmPs, dimension, ellNm, maxBand);
  }, [alphaNmPs, dimension, ellNm, maxBand]);

  // Evaluate selected wavefunction on x grid
  const wfXBounds = useMemo<[number, number]>(() => {
    if (wfScaleEnabled) {
      const x1 = parseFloat(wfXMinInput);
      const x2 = parseFloat(wfXMaxInput);
      if (Number.isFinite(x1) && Number.isFinite(x2) && x2 > x1) {
        return [x1, x2];
      }
    }
    return [-320, 320];
  }, [wfScaleEnabled, wfXMinInput, wfXMaxInput]);

  const wfGrid = useMemo(() => {
    const count = 420;
    const [xMin, xMax] = wfXBounds;
    const span = xMax - xMin;
    const xs = new Array<number>(count);
    const V = new Array<number>(count);
    for (let i = 0; i < count; i++) {
      const x = xMin + (i / (count - 1)) * span;
      xs[i] = x;
      V[i] = effectivePotentialMeV(x, alphaNmPs);
    }
    const coeffs = eigenResult.bandCoeffs[activeSelectedBand];
    const parity = eigenResult.parities[activeSelectedBand];
    const psi = evaluateWavefunction(xs, coeffs, parity, ellNm);
    return { xs, V, psi };
  }, [wfXBounds, alphaNmPs, eigenResult, activeSelectedBand, ellNm]);

  // Default bounds for Band Structure
  const bandDefaultBounds = useMemo<ViewportBounds>(() => {
    const xMin =
      xAxisMode === 'alpha' ? ALPHA_MIN_DEFAULT : ALPHA_MIN_DEFAULT * ALPHA_TO_KY_FACTOR;
    const xMax =
      xAxisMode === 'alpha' ? ALPHA_MAX_DEFAULT : ALPHA_MAX_DEFAULT * ALPHA_TO_KY_FACTOR;
    let maxE = 15;
    for (const pt of bandData.points) {
      const top = pt.energiesMeV[pt.energiesMeV.length - 1] ?? 10;
      if (top > maxE) maxE = top;
    }
    return {
      xMin,
      xMax,
      yMin: -0.5,
      yMax: Math.ceil(maxE * 1.1),
    };
  }, [xAxisMode, bandData]);

  const bandExternalBounds = useMemo<ViewportBounds | null>(() => {
    if (!bandScaleEnabled) return null;
    const xMin = parseFloat(bandXMinInput);
    const xMax = parseFloat(bandXMaxInput);
    const yMin = parseFloat(bandEMinInput);
    const yMax = parseFloat(bandEMaxInput);
    if (
      Number.isFinite(xMin) &&
      Number.isFinite(xMax) &&
      Number.isFinite(yMin) &&
      Number.isFinite(yMax) &&
      xMax > xMin &&
      yMax > yMin
    ) {
      return { xMin, xMax, yMin, yMax };
    }
    return null;
  }, [bandScaleEnabled, bandXMinInput, bandXMaxInput, bandEMinInput, bandEMaxInput]);

  // Default & manual bounds for Wavefunction E-x plot
  const wfDefaultBounds = useMemo<ViewportBounds>(() => {
    const topEnergy = eigenResult.energiesMeV[eigenResult.energiesMeV.length - 1] ?? 15;
    const vCenter = effectivePotentialMeV(0, alphaNmPs);
    const yMax = Math.max(20, topEnergy * 1.45, Math.min(45, vCenter * 1.25));
    return {
      xMin: -320,
      xMax: 320,
      yMin: -1.5,
      yMax,
    };
  }, [eigenResult, alphaNmPs]);

  const wfExternalBounds = useMemo<ViewportBounds | null>(() => {
    if (!wfScaleEnabled) return null;
    const xMin = parseFloat(wfXMinInput);
    const xMax = parseFloat(wfXMaxInput);
    const yMin = parseFloat(wfEMinInput);
    const yMax = parseFloat(wfEMaxInput);
    if (
      Number.isFinite(xMin) &&
      Number.isFinite(xMax) &&
      Number.isFinite(yMin) &&
      Number.isFinite(yMax) &&
      xMax > xMin &&
      yMax > yMin
    ) {
      return { xMin, xMax, yMin, yMax };
    }
    return null;
  }, [wfScaleEnabled, wfXMinInput, wfXMaxInput, wfEMinInput, wfEMaxInput]);

  // EOM Expectation Chart default bounds
  const eomDefaultBounds = useMemo<ViewportBounds>(() => {
    const nMax = Math.max(1, maxBand);
    const maxV = Math.max(
      10,
      ...eigenResult.groupVelocityNmPs.map((v) => Math.abs(v) * 1.25)
    );
    return {
      xMin: -0.5,
      xMax: nMax + 0.5,
      yMin: Math.min(0, ...eigenResult.groupVelocityNmPs) - maxV * 0.2,
      yMax: Math.max(0, ...eigenResult.groupVelocityNmPs) + maxV * 0.25,
    };
  }, [maxBand, eigenResult]);

  // Handle X-axis mode toggle (keep manual inputs synced sensibly)
  const handleToggleXAxisMode = (mode: XAxisMode) => {
    if (mode === xAxisMode) return;
    setXAxisMode(mode);
    if (mode === 'ky') {
      setBandXMinInput((ALPHA_MIN_DEFAULT * ALPHA_TO_KY_FACTOR).toFixed(3));
      setBandXMaxInput((ALPHA_MAX_DEFAULT * ALPHA_TO_KY_FACTOR).toFixed(3));
    } else {
      setBandXMinInput(String(ALPHA_MIN_DEFAULT));
      setBandXMaxInput(String(ALPHA_MAX_DEFAULT));
    }
  };

  // Draw Band Structure
  const drawBandStructure = useCallback(
    (dc: DrawContext) => {
      const { ctx, pad, plotH, toPxX, toPxY } = dc;
      const numBands = maxBand + 1;

      // Vertical reference line for current alpha / ky
      const currentX = xAxisMode === 'alpha' ? alphaNmPs : alphaNmPs * ALPHA_TO_KY_FACTOR;
      const pxCurr = toPxX(currentX);
      ctx.save();
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.35)';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(pxCurr, pad.top);
      ctx.lineTo(pxCurr, pad.top + plotH);
      ctx.stroke();
      ctx.restore();

      // Highlight degenerate points UNDER curves if checked
      if (highlightDegeneracy && bandData.degeneracies.length > 0) {
        for (const deg of bandData.degeneracies) {
          const xVal = xAxisMode === 'alpha' ? deg.alpha : deg.ky;
          const px = toPxX(xVal);
          const py = toPxY(deg.energyMeV);
          ctx.beginPath();
          ctx.arc(px, py, Math.max(5.5, pointSize + 3.5), 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(245, 158, 11, 0.22)';
          ctx.fill();
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = '#d97706';
          ctx.stroke();
        }
      }

      // Draw each band n = 0 .. maxBand
      for (let b = 0; b < numBands; b++) {
        const color = BAND_COLORS[b % BAND_COLORS.length];

        if (connectPoints) {
          ctx.beginPath();
          for (let i = 0; i < bandData.points.length; i++) {
            const pt = bandData.points[i];
            const xVal = xAxisMode === 'alpha' ? pt.alpha : pt.ky;
            const px = toPxX(xVal);
            const py = toPxY(pt.energiesMeV[b]);
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.8;
          ctx.stroke();
        }

        if (drawDiscretePoints) {
          ctx.fillStyle = color;
          for (let i = 0; i < bandData.points.length; i++) {
            const pt = bandData.points[i];
            const xVal = xAxisMode === 'alpha' ? pt.alpha : pt.ky;
            const px = toPxX(xVal);
            const py = toPxY(pt.energiesMeV[b]);
            ctx.beginPath();
            ctx.arc(px, py, pointSize, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    },
    [
      maxBand,
      xAxisMode,
      alphaNmPs,
      highlightDegeneracy,
      bandData,
      pointSize,
      connectPoints,
      drawDiscretePoints,
    ]
  );

  // Draw Wavefunction + Potential E-x
  const drawWavefunction = useCallback(
    (dc: DrawContext) => {
      const { ctx, pad, plotW, bounds, toPxX, toPxY } = dc;

      // 1. Effective Potential V(x, alpha) over visible bounds
      const samples = 360;
      ctx.beginPath();
      for (let i = 0; i <= samples; i++) {
        const x = bounds.xMin + (i / samples) * (bounds.xMax - bounds.xMin);
        const v = effectivePotentialMeV(x, alphaNmPs);
        const px = toPxX(x);
        const py = toPxY(v);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2.2;
      ctx.stroke();

      // 2. Faint energy level lines for all bands 0 .. maxBand
      for (let b = 0; b < eigenResult.energiesMeV.length; b++) {
        const eb = eigenResult.energiesMeV[b];
        const py = toPxY(eb);
        const isSelected = b === activeSelectedBand;
        ctx.save();
        ctx.strokeStyle = isSelected ? '#dc2626' : 'rgba(100, 116, 139, 0.38)';
        ctx.lineWidth = isSelected ? 1.8 : 1;
        ctx.setLineDash(isSelected ? [6, 4] : [3, 4]);
        ctx.beginPath();
        ctx.moveTo(pad.left, py);
        ctx.lineTo(pad.left + plotW, py);
        ctx.stroke();
        ctx.restore();

        if (isSelected) {
          ctx.fillStyle = '#dc2626';
          ctx.font = '600 11px "IBM Plex Mono", monospace';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'bottom';
          ctx.fillText(`E_${b} = ${eb.toFixed(3)} meV`, pad.left + 8, py - 4);
        }
      }

      // 3. Wavefunction psi_n(x) and optional |psi_n(x)|^2 anchored at E_n
      const En = eigenResult.energiesMeV[activeSelectedBand];
      const { xs, psi } = wfGrid;

      // Compute normalized display scale so wavefunctions look clear regardless of E
      let maxAbsPsi = 0;
      for (let i = 0; i < psi.length; i++) {
        if (Math.abs(psi[i]) > maxAbsPsi) maxAbsPsi = Math.abs(psi[i]);
      }
      const normFactor = maxAbsPsi > 0 ? 1 / maxAbsPsi : 1;
      // Scale height in meV units: psiScale * normalized psi
      const ampMeV = psiScale * 0.25;

      if (showProbDensity) {
        ctx.beginPath();
        ctx.moveTo(toPxX(xs[0]), toPxY(En));
        for (let i = 0; i < xs.length; i++) {
          const pNorm = psi[i] * normFactor;
          const yVal = En + ampMeV * pNorm * pNorm;
          ctx.lineTo(toPxX(xs[i]), toPxY(yVal));
        }
        ctx.lineTo(toPxX(xs[xs.length - 1]), toPxY(En));
        ctx.closePath();
        ctx.fillStyle = 'rgba(13, 148, 136, 0.22)';
        ctx.fill();
      }

      // psi_n(x) curve
      ctx.beginPath();
      for (let i = 0; i < xs.length; i++) {
        const yVal = En + ampMeV * (psi[i] * normFactor);
        const px = toPxX(xs[i]);
        const py = toPxY(yVal);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = BAND_COLORS[activeSelectedBand % BAND_COLORS.length];
      ctx.lineWidth = 2.3;
      ctx.stroke();
    },
    [alphaNmPs, eigenResult, activeSelectedBand, wfGrid, psiScale, showProbDensity]
  );

  // Draw Quantum EOM Expectation Chart (Group Velocity & Width across bands)
  const drawQuantumEom = useCallback(
    (dc: DrawContext) => {
      const { ctx, toPxX, toPxY } = dc;
      const count = eigenResult.energiesMeV.length;

      // Connect group velocities d<y>/dt across bands
      ctx.beginPath();
      for (let n = 0; n < count; n++) {
        const px = toPxX(n);
        const py = toPxY(eigenResult.groupVelocityNmPs[n]);
        if (n === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = '#1d4ed8';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Points & error-bar style spread indicators
      for (let n = 0; n < count; n++) {
        const px = toPxX(n);
        const vg = eigenResult.groupVelocityNmPs[n];
        const py = toPxY(vg);

        ctx.beginPath();
        ctx.arc(px, py, n === activeSelectedBand ? 6.5 : 4.5, 0, Math.PI * 2);
        ctx.fillStyle = n === activeSelectedBand ? '#dc2626' : '#1d4ed8';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = '#334155';
        ctx.font = '500 10px "IBM Plex Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(vg.toFixed(1), px, py - 8);
      }
    },
    [eigenResult, activeSelectedBand]
  );

  // CSV Export handler
  const handleExportCsv = () => {
    if (subTab === 'bands') {
      const bandHeaders = Array.from({ length: maxBand + 1 }, (_, i) => `E_${i} (meV)`);
      downloadCsv(
        `quantum_bands_N${dimension}.csv`,
        ['alpha (nm/ps)', 'k_y (nm^-1)', ...bandHeaders],
        bandData.points.map((pt) => [
          pt.alpha.toFixed(4),
          pt.ky.toFixed(6),
          ...pt.energiesMeV.map((e) => e.toFixed(6)),
        ])
      );
    } else if (subTab === 'wavefunction') {
      const En = eigenResult.energiesMeV[activeSelectedBand];
      downloadCsv(
        `quantum_wavefunction_n${activeSelectedBand}_N${dimension}.csv`,
        ['x (nm)', 'V(x,alpha) (meV)', `E_${activeSelectedBand} (meV)`, `psi_${activeSelectedBand}(x) (nm^-1/2)`, `|psi_${activeSelectedBand}(x)|^2 (nm^-1)`],
        wfGrid.xs.map((x, i) => [
          x.toFixed(3),
          wfGrid.V[i].toFixed(6),
          En.toFixed(6),
          wfGrid.psi[i].toExponential(6),
          (wfGrid.psi[i] * wfGrid.psi[i]).toExponential(6),
        ])
      );
    } else {
      downloadCsv(
        `quantum_eom_expectations_N${dimension}.csv`,
        ['Band n', 'Parity', 'E_n (meV)', '<x^2>_n (nm^2)', 'Delta_x (nm)', '<x^4>_n (nm^4)', 'd<y>/dt = v_g (nm/ps)'],
        eigenResult.energiesMeV.map((e, n) => [
          n,
          eigenResult.parities[n] === 0 ? 'Even' : 'Odd',
          e.toFixed(6),
          eigenResult.expectationX2Nm2[n].toFixed(4),
          Math.sqrt(eigenResult.expectationX2Nm2[n]).toFixed(4),
          eigenResult.expectationX4Nm4[n].toFixed(2),
          eigenResult.groupVelocityNmPs[n].toFixed(5),
        ])
      );
    }
  };

  const currentKy = alphaNmPs * ALPHA_TO_KY_FACTOR;
  const selectedEnergy = eigenResult.energiesMeV[activeSelectedBand] ?? 0;
  const adjacentGap =
    activeSelectedBand + 1 < eigenResult.energiesMeV.length
      ? Math.abs(eigenResult.energiesMeV[activeSelectedBand + 1] - selectedEnergy)
      : activeSelectedBand > 0
      ? Math.abs(selectedEnergy - eigenResult.energiesMeV[activeSelectedBand - 1])
      : null;

  const mechanismText = useMemo(() => {
    if (subTab === 'bands') {
      return `當 α < 0（對應 k_y < 0）時，有效位能 V(x, α) 形成對稱雙勢阱。偶宇稱與奇宇稱能階在勢壘下方產生穿隧劈裂，隨 α 愈負、勢壘愈高，兩相鄰能階呈指數趨近簡併重疊（橘色標註點）；當 α ≥ 0 時轉為單勢阱，簡併消失並呈現非線性四次方能階間距。`;
    }
    if (subTab === 'wavefunction') {
      const parityStr = eigenResult.parities[activeSelectedBand] === 0 ? '偶宇稱 (對稱)' : '奇宇稱 (反對稱)';
      return `當前顯示第 n = ${activeSelectedBand} 能帶本徵態（${parityStr}）。當 α < 0 且 E_n 低於中央勢壘 V(0) = ½m*α² 時，波函數雙峰分別局域於左右兩個磁場相反的勢阱中；提高 α 或能階數 n 使 E_n > V(0) 時，波函數重新延伸跨越 x = 0。`;
    }
    return `依據埃倫費斯特定理推導出的量子運動方程式，位置與動量期望值滿足與經典形式相同的結構。特別地，y 方向漂移期望速度 d⟨y⟩ₙ/dt = α + ½β⟨x²⟩ₙ 嚴格等於能帶色散關係的群速度 (1/ħ)(∂Eₙ/∂k_y)，展現量子－經典對應原理。`;
  }, [subTab, eigenResult.parities, activeSelectedBand]);

  return (
    <div className="space-y-6">
      {/* Asymmetric Split Console */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Control Deck */}
        <aside className="lg:col-span-4 xl:col-span-3 bg-white border border-slate-200 rounded-xl p-4 space-y-5">
          {/* Matrix Dimension & Characteristic Length */}
          <div data-tour="quantum-matrix" className="space-y-3">
            <h3 className="text-xs font-bold text-slate-900">矩陣對角化設定</h3>

            <div className="space-y-1.5">
              <div className="text-xs font-medium text-slate-700">矩陣截斷維度 N</div>
              <div className="grid grid-cols-5 gap-1">
                {DIMENSIONS.map((dim) => (
                  <button
                    key={dim}
                    type="button"
                    onClick={() => setDimension(dim)}
                    className={`py-1.5 text-xs font-mono rounded border transition-colors cursor-pointer ${
                      dimension === dim
                        ? 'bg-blue-700 text-white border-blue-700 font-semibold'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {dim}
                  </button>
                ))}
              </div>
            </div>

            {/* Characteristic length ell */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label className="font-medium text-slate-700">展幅尺度 ℓ</label>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold text-slate-900">
                    {ellNm.toFixed(2)} nm
                  </span>
                  <button
                    type="button"
                    onClick={() => setEllNm(Number(ELL_OPTIMAL_NM.toFixed(2)))}
                    className="text-[11px] text-blue-700 hover:underline cursor-pointer"
                  >
                    最佳 ℓ₀
                  </button>
                </div>
              </div>
              <input
                type="range"
                min={20}
                max={65}
                step={0.1}
                value={ellNm}
                onChange={(e) => setEllNm(parseFloat(e.target.value))}
                className="lab-slider w-full"
              />
              <p className="text-[11px] text-slate-500">
                最佳理論值 ℓ₀ = (ħL / eB₀)^(1/3) ≈ {ELL_OPTIMAL_NM.toFixed(2)} nm
              </p>
            </div>
          </div>

          <hr className="border-slate-200" />

          {/* X-axis Variable & Band Count */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-slate-700">動量座標軸切換</div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => handleToggleXAxisMode('alpha')}
                  className={`py-1.5 px-2 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                    xAxisMode === 'alpha'
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  E(α) [nm/ps]
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleXAxisMode('ky')}
                  className={`py-1.5 px-2 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                    xAxisMode === 'ky'
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  E(k_y) [nm⁻¹]
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="text-xs font-medium text-slate-700">顯示能帶數 (Band 數)</div>
              <div className="grid grid-cols-3 gap-1.5">
                {BAND_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setMaxBand(opt.value)}
                    className={`py-1.5 px-2 text-xs font-mono rounded-lg border transition-colors cursor-pointer ${
                      maxBand === opt.value
                        ? 'bg-blue-700 text-white border-blue-700 font-semibold'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <hr className="border-slate-200" />

          {/* Context-sensitive controls */}
          {subTab === 'bands' && (
            <div data-tour="quantum-bands-ctrl" className="space-y-4">
              <h3 className="text-xs font-bold text-slate-900">能帶繪圖選項</h3>

              <div className="space-y-2 text-xs">
                <label className="flex items-center gap-2 cursor-pointer text-slate-700">
                  <input
                    type="checkbox"
                    checked={connectPoints}
                    onChange={(e) => setConnectPoints(e.target.checked)}
                    className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                  />
                  <span>連接各點 (能帶連線)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-slate-700">
                  <input
                    type="checkbox"
                    checked={drawDiscretePoints}
                    onChange={(e) => setDrawDiscretePoints(e.target.checked)}
                    className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                  />
                  <span>繪製離散點</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-slate-700">
                  <input
                    type="checkbox"
                    checked={highlightDegeneracy}
                    onChange={(e) => setHighlightDegeneracy(e.target.checked)}
                    className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                  />
                  <span>重點標註簡併重疊點</span>
                </label>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <label className="font-medium text-slate-700">離散點大小</label>
                  <span className="font-mono text-slate-900">{pointSize.toFixed(1)} px</span>
                </div>
                <input
                  type="range"
                  min={1.5}
                  max={7}
                  step={0.5}
                  value={pointSize}
                  onChange={(e) => setPointSize(parseFloat(e.target.value))}
                  className="lab-slider w-full"
                />
              </div>

              {/* Manual E-scale & x-axis scale */}
              <div className="space-y-2.5 pt-1 border-t border-slate-200">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bandScaleEnabled}
                    onChange={(e) => setBandScaleEnabled(e.target.checked)}
                    className="rounded border-slate-300 text-blue-700"
                  />
                  <span>手動調整 E-scale 與 x 軸範圍</span>
                </label>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="text-[11px] text-slate-500">
                      {xAxisMode === 'alpha' ? 'α_min' : 'k_y min'}
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={bandXMinInput}
                      onChange={(e) => {
                        setBandXMinInput(e.target.value);
                        setBandScaleEnabled(true);
                      }}
                      className="mt-0.5 w-full px-2 py-1 font-mono text-xs border border-slate-300 rounded bg-white"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500">
                      {xAxisMode === 'alpha' ? 'α_max' : 'k_y max'}
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={bandXMaxInput}
                      onChange={(e) => {
                        setBandXMaxInput(e.target.value);
                        setBandScaleEnabled(true);
                      }}
                      className="mt-0.5 w-full px-2 py-1 font-mono text-xs border border-slate-300 rounded bg-white"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500">E_min (meV)</label>
                    <input
                      type="number"
                      step="any"
                      value={bandEMinInput}
                      onChange={(e) => {
                        setBandEMinInput(e.target.value);
                        setBandScaleEnabled(true);
                      }}
                      className="mt-0.5 w-full px-2 py-1 font-mono text-xs border border-slate-300 rounded bg-white"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500">E_max (meV)</label>
                    <input
                      type="number"
                      step="any"
                      value={bandEMaxInput}
                      onChange={(e) => {
                        setBandEMaxInput(e.target.value);
                        setBandScaleEnabled(true);
                      }}
                      className="mt-0.5 w-full px-2 py-1 font-mono text-xs border border-slate-300 rounded bg-white"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {subTab !== 'bands' && (
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-slate-900">量子態與動量調整</h3>

              {/* Alpha / ky Slider */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <label className="font-medium text-slate-700">
                    {xAxisMode === 'alpha' ? '動量參數 α' : '波數 k_y'}
                  </label>
                  <span className="font-mono font-semibold text-slate-900">
                    {xAxisMode === 'alpha'
                      ? `${alphaNmPs.toFixed(1)} nm/ps`
                      : `${currentKy.toFixed(4)} nm⁻¹`}
                  </span>
                </div>
                {xAxisMode === 'alpha' ? (
                  <input
                    type="range"
                    min={ALPHA_MIN_DEFAULT}
                    max={ALPHA_MAX_DEFAULT}
                    step={2}
                    value={alphaNmPs}
                    onChange={(e) => setAlphaNmPs(parseFloat(e.target.value))}
                    className="lab-slider w-full"
                  />
                ) : (
                  <input
                    type="range"
                    min={ALPHA_MIN_DEFAULT * ALPHA_TO_KY_FACTOR}
                    max={ALPHA_MAX_DEFAULT * ALPHA_TO_KY_FACTOR}
                    step={0.001}
                    value={currentKy}
                    onChange={(e) => setAlphaNmPs(kyToAlpha(parseFloat(e.target.value)))}
                    className="lab-slider w-full"
                  />
                )}
                <div className="flex justify-between text-[10px] font-mono text-slate-400">
                  <span>雙勢阱 (α &lt; 0)</span>
                  <span>0</span>
                  <span>單勢阱 (α &gt; 0)</span>
                </div>
              </div>

              {/* Band selector */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <label className="font-medium text-slate-700">選擇能帶波函數 n</label>
                  <span className="font-mono font-semibold text-blue-700">
                    n = {activeSelectedBand}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {Array.from({ length: maxBand + 1 }, (_, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setSelectedBand(idx)}
                      className={`w-7 h-7 text-xs font-mono rounded border transition-colors cursor-pointer ${
                        activeSelectedBand === idx
                          ? 'bg-blue-700 text-white border-blue-700 font-semibold'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {idx}
                    </button>
                  ))}
                </div>
              </div>

              {subTab === 'wavefunction' && (
                <>
                  <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showProbDensity}
                      onChange={(e) => setShowProbDensity(e.target.checked)}
                      className="rounded border-slate-300 text-teal-600"
                    />
                    <span>疊加機率密度 |ψₙ(x)|² 陰影</span>
                  </label>

                  {/* psi scale slider */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <label className="font-medium text-slate-700">ψ 振幅尺度 (ψ-scale)</label>
                      <span className="font-mono text-slate-900">{psiScale.toFixed(0)}</span>
                    </div>
                    <input
                      type="range"
                      min={2}
                      max={60}
                      step={1}
                      value={psiScale}
                      onChange={(e) => setPsiScale(parseFloat(e.target.value))}
                      className="lab-slider w-full"
                    />
                  </div>

                  {/* Manual E-scale, psi-scale, x-axis scale */}
                  <div className="space-y-2.5 pt-1 border-t border-slate-200">
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-900 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={wfScaleEnabled}
                        onChange={(e) => setWfScaleEnabled(e.target.checked)}
                        className="rounded border-slate-300 text-blue-700"
                      />
                      <span>手動調整 E-scale 與 x 軸範圍</span>
                    </label>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <label className="text-[11px] text-slate-500">x_min (nm)</label>
                        <input
                          type="number"
                          value={wfXMinInput}
                          onChange={(e) => {
                            setWfXMinInput(e.target.value);
                            setWfScaleEnabled(true);
                          }}
                          className="mt-0.5 w-full px-2 py-1 font-mono text-xs border border-slate-300 rounded bg-white"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-500">x_max (nm)</label>
                        <input
                          type="number"
                          value={wfXMaxInput}
                          onChange={(e) => {
                            setWfXMaxInput(e.target.value);
                            setWfScaleEnabled(true);
                          }}
                          className="mt-0.5 w-full px-2 py-1 font-mono text-xs border border-slate-300 rounded bg-white"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-500">E_min (meV)</label>
                        <input
                          type="number"
                          value={wfEMinInput}
                          onChange={(e) => {
                            setWfEMinInput(e.target.value);
                            setWfScaleEnabled(true);
                          }}
                          className="mt-0.5 w-full px-2 py-1 font-mono text-xs border border-slate-300 rounded bg-white"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-500">E_max (meV)</label>
                        <input
                          type="number"
                          value={wfEMaxInput}
                          onChange={(e) => {
                            setWfEMaxInput(e.target.value);
                            setWfScaleEnabled(true);
                          }}
                          className="mt-0.5 w-full px-2 py-1 font-mono text-xs border border-slate-300 rounded bg-white"
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </aside>

        {/* Right Main Viewport */}
        <div data-tour="quantum-stage" className="lg:col-span-8 xl:col-span-9 space-y-5">
          {/* Sub-Tab Selector */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
              {[
                { id: 'bands' as const, label: '1. 能帶圖 E(α) / E(k_y)' },
                { id: 'wavefunction' as const, label: '2. 波函數與 E-x 圖' },
                { id: 'eom' as const, label: '3. 量子運動方程式視圖' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSubTab(t.id)}
                  className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    subTab === t.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="text-xs font-mono text-slate-600">
              維度 N = {dimension} · 簡併點數: {bandData.degeneracies.length}
            </div>
          </div>

          {/* Sub-tab 1: Band Structure */}
          {subTab === 'bands' && (
            <ScientificCanvas
              title={
                xAxisMode === 'alpha'
                  ? '量子能帶色散圖 Eₙ(α)'
                  : '量子能帶色散圖 Eₙ(k_y)'
              }
              subtitle={`矩陣截斷維度 N = ${dimension} · 顯示能帶 n = 0${maxBand > 0 ? `..${maxBand}` : ''} · 雙勢阱區間呈現偶/奇宇稱簡併重疊`}
              xLabel={xAxisMode === 'alpha' ? 'α' : 'k_y'}
              yLabel="本徵能量 Eₙ"
              xUnit={xAxisMode === 'alpha' ? 'nm/ps' : 'nm⁻¹'}
              yUnit="meV"
              defaultBounds={bandDefaultBounds}
              externalBounds={bandExternalBounds}
              onDraw={drawBandStructure}
              onExportCsv={handleExportCsv}
              pngFilename={`quantum_bands_N${dimension}.png`}
              heightClass="h-[500px]"
              legend={
                <div className="flex flex-wrap items-center gap-3">
                  {Array.from({ length: maxBand + 1 }, (_, b) => (
                    <span key={b} className="inline-flex items-center gap-1 font-mono text-[11px]">
                      <span
                        className="w-3 h-0.5 inline-block"
                        style={{ backgroundColor: BAND_COLORS[b % BAND_COLORS.length] }}
                      />
                      <span>n={b}</span>
                    </span>
                  ))}
                  {highlightDegeneracy && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 font-medium">
                      <span className="w-2.5 h-2.5 rounded-full border-2 border-amber-600 bg-amber-200/50 inline-block" />
                      <span>簡併重疊點 (ΔE &lt; 0.06 meV)</span>
                    </span>
                  )}
                </div>
              }
            />
          )}

          {/* Sub-tab 2: Wavefunction + E-x */}
          {subTab === 'wavefunction' && (
            <ScientificCanvas
              title={`第 n = ${activeSelectedBand} 能帶波函數 ψₙ(x) 與有效位能 E-x 圖`}
              subtitle={`α = ${alphaNmPs.toFixed(1)} nm/ps (k_y = ${currentKy.toFixed(4)} nm⁻¹) · E_${activeSelectedBand} = ${selectedEnergy.toFixed(4)} meV`}
              xLabel="x"
              yLabel="能量 E / V(x) 與 ψₙ(x) 疊加"
              xUnit="nm"
              yUnit="meV"
              defaultBounds={wfDefaultBounds}
              externalBounds={wfExternalBounds}
              onDraw={drawWavefunction}
              onExportCsv={handleExportCsv}
              pngFilename={`quantum_wavefunction_n${activeSelectedBand}.png`}
              heightClass="h-[500px]"
              legend={
                <div className="flex flex-wrap items-center gap-4">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-4 h-0.5 bg-slate-900 inline-block" />
                    <span>有效位能 V(x, α)</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-4 border-t-2 border-dashed border-red-600 inline-block" />
                    <span>本徵能階 E_{activeSelectedBand}</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="w-4 h-0.5 inline-block"
                      style={{
                        backgroundColor:
                          BAND_COLORS[activeSelectedBand % BAND_COLORS.length],
                      }}
                    />
                    <span>波函數 ψ_{activeSelectedBand}(x)</span>
                  </span>
                  {showProbDensity && (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-3 h-3 bg-teal-600/25 border border-teal-600/40 inline-block" />
                      <span>機率密度 |ψ_{activeSelectedBand}(x)|²</span>
                    </span>
                  )}
                </div>
              }
            />
          )}

          {/* Sub-tab 3: Quantum Equations of Motion View */}
          {subTab === 'eom' && (
            <div className="space-y-5">
              {/* Ehrenfest Theorem Equations Card */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-slate-900">
                    量子行為運動方程式（埃倫費斯特定理 Ehrenfest Theorem）[式 (54)]
                  </h3>
                  <span className="text-xs text-slate-500">
                    由對易子 [Ô, H] 推導並與能帶群速度精確對應
                  </span>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="text-xs font-semibold text-slate-700 mb-1">
                      量子運動方程式 (期望值動力學)
                    </div>
                    <MathBlock
                      display
                      tex="\begin{cases} \dfrac{d^2\langle x\rangle_n}{dt^2} + \alpha\beta\langle x\rangle_n + \dfrac{1}{2}\beta^2\langle x^3\rangle_n = 0 \\[10pt] \dfrac{d\langle\hat{y}\rangle_n}{dt} = \alpha + \dfrac{1}{2}\beta\langle x^2\rangle_n = \dfrac{1}{\hbar}\dfrac{\partial E_n}{\partial k_y} \end{cases}"
                    />
                  </div>
                  <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2 text-xs text-slate-700">
                    <div className="font-semibold text-slate-900">四條正則對易子關係</div>
                    <MathBlock
                      display
                      tex="\langle p_x\rangle_n = m^*\frac{d\langle x\rangle_n}{dt}, \qquad \frac{d\langle \hat{p}_y\rangle_n}{dt} = 0"
                    />
                    <p className="text-slate-600 leading-relaxed">
                      對本徵定態 <MathBlock tex="|n, k_y\rangle" /> 而言，由宇稱對稱性知{' '}
                      <MathBlock tex="\langle x\rangle_n = \langle x^3\rangle_n = 0" />，而偶次矩{' '}
                      <MathBlock tex="\langle x^2\rangle_n" /> 決定該能帶電子的淨漂移（群速度）{' '}
                      <MathBlock tex="v_{g,n} = d\langle\hat{y}\rangle_n/dt" />。
                    </p>
                  </div>
                </div>
              </div>

              {/* Group Velocity vs Band n Plot */}
              <ScientificCanvas
                title={`各能帶量子漂移群速度 d⟨y⟩ₙ/dt = α + ½β⟨x²⟩ₙ (α = ${alphaNmPs.toFixed(1)} nm/ps)`}
                subtitle="比較不同能階在固定動量下的期望漂移速率"
                xLabel="能帶指標 n"
                yLabel="群速度 d⟨y⟩ₙ/dt"
                xUnit=""
                yUnit="nm/ps"
                defaultBounds={eomDefaultBounds}
                onDraw={drawQuantumEom}
                onExportCsv={handleExportCsv}
                pngFilename={`quantum_eom_N${dimension}.png`}
                heightClass="h-[340px]"
              />

              {/* Expectation Table */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-900">
                    各本徵態期望值數據表 (α = {alphaNmPs.toFixed(1)} nm/ps)
                  </h4>
                  <span className="text-xs text-slate-500">點擊列可切換選定能帶 n</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                      <tr>
                        <th className="py-2.5 px-3 font-semibold">能帶 n</th>
                        <th className="py-2.5 px-3 font-semibold">宇稱</th>
                        <th className="py-2.5 px-3 font-semibold text-right">Eₙ (meV)</th>
                        <th className="py-2.5 px-3 font-semibold text-right">⟨x²⟩ₙ (nm²)</th>
                        <th className="py-2.5 px-3 font-semibold text-right">Δx = √⟨x²⟩ (nm)</th>
                        <th className="py-2.5 px-3 font-semibold text-right">d⟨y⟩ₙ/dt (nm/ps)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {eigenResult.energiesMeV.map((e, n) => (
                        <tr
                          key={n}
                          onClick={() => setSelectedBand(n)}
                          className={`cursor-pointer transition-colors ${
                            n === activeSelectedBand
                              ? 'bg-blue-50/80 text-blue-950 font-semibold'
                              : 'hover:bg-slate-50 text-slate-800'
                          }`}
                        >
                          <td className="py-2 px-3">n = {n}</td>
                          <td className="py-2 px-3 font-sans">
                            {eigenResult.parities[n] === 0 ? '偶宇稱' : '奇宇稱'}
                          </td>
                          <td className="py-2 px-3 text-right">{e.toFixed(5)}</td>
                          <td className="py-2 px-3 text-right">
                            {eigenResult.expectationX2Nm2[n].toFixed(2)}
                          </td>
                          <td className="py-2 px-3 text-right">
                            {Math.sqrt(eigenResult.expectationX2Nm2[n]).toFixed(2)}
                          </td>
                          <td className="py-2 px-3 text-right">
                            {eigenResult.groupVelocityNmPs[n].toFixed(3)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Info Blocks: Real-Time Parameters, System Parameters, Physics Explanation */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2.5">
              <h4 className="text-xs font-bold text-slate-900">即時量子態參數</h4>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                <dt className="text-slate-500">動量參數 α</dt>
                <dd className="font-mono text-right text-slate-900">{alphaNmPs.toFixed(1)} nm/ps</dd>
                <dt className="text-slate-500">波數 k_y</dt>
                <dd className="font-mono text-right text-slate-900">{currentKy.toFixed(4)} nm⁻¹</dd>
                <dt className="text-slate-500">選定能階 E_{activeSelectedBand}</dt>
                <dd className="font-mono text-right text-blue-700 font-semibold">
                  {selectedEnergy.toFixed(5)} meV
                </dd>
                <dt className="text-slate-500">相鄰能隙 ΔE</dt>
                <dd className="font-mono text-right text-slate-900">
                  {adjacentGap !== null ? `${adjacentGap.toFixed(5)} meV` : '—'}
                </dd>
                <dt className="text-slate-500">波包展寬 Δx</dt>
                <dd className="font-mono text-right text-slate-900">
                  {Math.sqrt(eigenResult.expectationX2Nm2[activeSelectedBand] ?? 0).toFixed(2)} nm
                </dd>
                <dt className="text-slate-500">群速度 d⟨y⟩/dt</dt>
                <dd className="font-mono text-right text-slate-900">
                  {(eigenResult.groupVelocityNmPs[activeSelectedBand] ?? 0).toFixed(3)} nm/ps
                </dd>
              </dl>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2.5">
              <h4 className="text-xs font-bold text-slate-900">系統與基底參數</h4>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                <dt className="text-slate-500">有效質量 m*</dt>
                <dd className="font-mono text-right text-slate-900">{SYSTEM_PARAMS.mRatio} mₑ</dd>
                <dt className="text-slate-500">磁場尺度 B₀ / L</dt>
                <dd className="font-mono text-right text-slate-900">
                  {SYSTEM_PARAMS.B0} T / 16π² nm
                </dd>
                <dt className="text-slate-500">參數 β</dt>
                <dd className="font-mono text-right text-slate-900">
                  {BETA_NM_PS.toFixed(5)} nm⁻¹ps⁻¹
                </dd>
                <dt className="text-slate-500">特徵尺度 ℓ</dt>
                <dd className="font-mono text-right text-slate-900">{ellNm.toFixed(2)} nm</dd>
                <dt className="text-slate-500">矩陣截斷維度</dt>
                <dd className="font-mono text-right text-slate-900">
                  {dimension} × {dimension}
                </dd>
                <dt className="text-slate-500">顯示能帶數</dt>
                <dd className="font-mono text-right text-slate-900">
                  {maxBand + 1} 條 (n=0..{maxBand})
                </dd>
              </dl>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
              <h4 className="text-xs font-bold text-slate-900">物理機制說明</h4>
              <p className="text-xs leading-relaxed text-slate-600">{mechanismText}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
