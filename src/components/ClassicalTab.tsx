import { useCallback, useEffect, useMemo, useState } from 'react';
import { Maximize2, Pause, Play, RotateCcw, Sparkles } from 'lucide-react';
import {
  CLASSICAL_PRESETS,
  ClassicalInitialConditions,
  analyzeClassicalSystem,
  effectivePotentialMeV,
  integrateElectronBeam,
  integrateTrajectory,
  interpolatePointAtTime,
} from '../physics/classical';
import {
  BETA_NM_PS,
  SYSTEM_PARAMS,
  magneticFieldAtX,
} from '../physics/constants';
import { downloadCsv } from '../utils/export';
import { MathBlock } from './MathBlock';
import { DrawContext, ScientificCanvas, ViewportBounds } from './ScientificCanvas';

type ClassicalSubTab = 'trajectory' | 'phase' | 'energy';
type PhaseMode = 'xdot-x' | 'vx-vy';

const SPECIAL_ANGLES = [
  { label: '-180°', val: -180 },
  { label: '-135°', val: -135 },
  { label: '-90°', val: -90 },
  { label: '-45°', val: -45 },
  { label: '-40.71° (∞)', val: -40.71 },
  { label: '0°', val: 0 },
  { label: '30°', val: 30 },
  { label: '45°', val: 45 },
  { label: '60°', val: 60 },
  { label: '90°', val: 90 },
  { label: '135°', val: 135 },
  { label: '180°', val: 180 },
];

const SPEED_OPTIONS = [0.25, 0.5, 1, 2, 4];
const T_MAX_PS = 18;
const DT_PS = 0.005;

const TRAJECTORY_FIXED_BOUNDS: ViewportBounds = {
  xMin: -260,
  xMax: 260,
  yMin: -320,
  yMax: 520,
};

interface CompactNumberInputProps {
  value: number;
  min: number;
  max: number;
  step: number;
  decimals: number;
  unit: string;
  ariaLabel: string;
  onChange: (val: number) => void;
}

function CompactNumberInput({
  value,
  min,
  max,
  step,
  decimals,
  unit,
  ariaLabel,
  onChange,
}: CompactNumberInputProps) {
  const [text, setText] = useState<string>(value.toFixed(decimals));
  const [focused, setFocused] = useState<boolean>(false);

  useEffect(() => {
    if (!focused) {
      setText(value.toFixed(decimals));
    }
  }, [value, decimals, focused]);

  const commit = (raw: string) => {
    const parsed = parseFloat(raw);
    if (Number.isFinite(parsed)) {
      const clamped = Math.min(max, Math.max(min, parsed));
      onChange(clamped);
      setText(clamped.toFixed(decimals));
    } else {
      setText(value.toFixed(decimals));
    }
  };

  return (
    <div className="inline-flex items-center gap-1">
      <input
        type="number"
        aria-label={ariaLabel}
        min={min}
        max={max}
        step={step}
        value={text}
        onFocus={() => setFocused(true)}
        onChange={(e) => {
          const raw = e.target.value;
          setText(raw);
          const parsed = parseFloat(raw);
          if (Number.isFinite(parsed) && parsed >= min && parsed <= max) {
            onChange(parsed);
          }
        }}
        onBlur={() => {
          setFocused(false);
          commit(text);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit(text);
            (e.currentTarget as HTMLInputElement).blur();
          }
        }}
        className="w-20 px-2 py-0.5 text-right font-mono text-xs font-semibold text-slate-900 bg-white border border-slate-300 rounded focus:outline-none focus:border-blue-600"
      />
      <span className="text-[11px] font-mono text-slate-500">{unit}</span>
    </div>
  );
}

function bFieldColor(bTesla: number, bMaxTesla: number): string {
  const norm = Math.max(-1, Math.min(1, bTesla / Math.max(0.1, bMaxTesla)));
  if (norm < 0) {
    // Soft cool blue for B_z < 0
    const t = Math.abs(norm);
    const r = Math.round(255 - t * (255 - 219));
    const g = Math.round(255 - t * (255 - 234));
    const b = Math.round(255 - t * (255 - 254));
    return `rgb(${r},${g},${b})`;
  } else {
    // Soft warm amber-coral for B_z > 0
    const t = norm;
    const r = Math.round(255 - t * (255 - 254));
    const g = Math.round(255 - t * (255 - 232));
    const b = Math.round(255 - t * (255 - 214));
    return `rgb(${r},${g},${b})`;
  }
}

export function ClassicalTab() {
  const [subTab, setSubTab] = useState<ClassicalSubTab>('trajectory');
  const [phaseMode, setPhaseMode] = useState<PhaseMode>('xdot-x');
  const [activePresetId, setActivePresetId] = useState<string>('snake');
  const [beamMode, setBeamMode] = useState<boolean>(false);

  const [ic, setIc] = useState<ClassicalInitialConditions>(
    CLASSICAL_PRESETS.find((p) => p.id === 'snake')!.conditions
  );

  // Animation state
  const [currentTimePs, setCurrentTimePs] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);

  const summary = useMemo(() => analyzeClassicalSystem(ic), [ic]);

  const { points, periodT } = useMemo(
    () => integrateTrajectory(ic, T_MAX_PS, DT_PS),
    [ic]
  );

  const beamTrajectories = useMemo(() => {
    if (!beamMode) return [];
    return integrateElectronBeam(ic, T_MAX_PS, 0.015, 9);
  }, [beamMode, ic]);

  // Animation loop
  useEffect(() => {
    if (!isPlaying) return;
    let rafId = 0;
    let lastTs = performance.now();

    const step = (now: number) => {
      const dtSec = Math.min(0.05, (now - lastTs) / 1000);
      lastTs = now;
      // 1x speed = 2.0 ps per real second for comfortable observation
      const simAdvance = dtSec * 2.0 * playbackSpeed;
      setCurrentTimePs((prev) => {
        const next = prev + simAdvance;
        return next > T_MAX_PS ? 0 : next;
      });
      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, playbackSpeed]);

  const currentPoint = useMemo(
    () => interpolatePointAtTime(points, currentTimePs),
    [points, currentTimePs]
  );

  const applyPreset = (presetId: string) => {
    const found = CLASSICAL_PRESETS.find((p) => p.id === presetId);
    if (!found) return;
    setActivePresetId(presetId);
    setIc({ ...found.conditions });
    setCurrentTimePs(0);
  };

  const updateIc = (patch: Partial<ClassicalInitialConditions>) => {
    setActivePresetId('custom');
    setIc((prev) => ({ ...prev, ...patch }));
  };

  // Optional on-demand trajectory fit bounds (never auto-triggered by slider changes)
  const [trajectoryFitBounds, setTrajectoryFitBounds] = useState<ViewportBounds | null>(null);
  const [trajectoryFitKey, setTrajectoryFitKey] = useState<number>(0);

  const handleFitTrajectory = useCallback(() => {
    let xMin = -180;
    let xMax = 180;
    let yMin = -180;
    let yMax = 180;
    if (points.length > 0) {
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (let i = 0; i < points.length; i += 4) {
        const p = points[i];
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
      for (const xt of summary.turningPointsX) {
        if (xt < minX) minX = xt;
        if (xt > maxX) maxX = xt;
      }
      const xPad = Math.max(45, (maxX - minX) * 0.25);
      const yPad = Math.max(45, (maxY - minY) * 0.15);
      xMin = Math.min(-60, minX - xPad);
      xMax = Math.max(60, maxX + xPad);
      yMin = minY - yPad;
      yMax = maxY + yPad;
    }
    setTrajectoryFitBounds({ xMin, xMax, yMin, yMax });
    setTrajectoryFitKey((k) => k + 1);
  }, [points, summary.turningPointsX]);

  const phaseDefaultBounds = useMemo<ViewportBounds>(() => {
    if (phaseMode === 'vx-vy') {
      const v = Math.max(60, summary.v0 * 1.25);
      return { xMin: -v, xMax: v, yMin: -v, yMax: v };
    }
    let maxAbsX = 160;
    let maxAbsVx = 100;
    for (let i = 0; i < points.length; i += 4) {
      maxAbsX = Math.max(maxAbsX, Math.abs(points[i].x));
      maxAbsVx = Math.max(maxAbsVx, Math.abs(points[i].vx));
    }
    return {
      xMin: -maxAbsX * 1.22,
      xMax: maxAbsX * 1.22,
      yMin: -maxAbsVx * 1.25,
      yMax: maxAbsVx * 1.25,
    };
  }, [phaseMode, points, summary.v0]);

  const energyDefaultBounds = useMemo<ViewportBounds>(() => {
    const outerXm =
      summary.turningPointsX.length > 0
        ? Math.max(...summary.turningPointsX.map((v) => Math.abs(v)))
        : 120;
    const xLim = Math.max(150, outerXm * 1.45);
    const eTop = Math.max(28, ic.energyMeV * 1.5, effectivePotentialMeV(0, summary.alpha) * 1.25);
    return {
      xMin: -xLim,
      xMax: xLim,
      yMin: -1.5,
      yMax: Math.min(80, eTop),
    };
  }, [summary, ic.energyMeV]);

  // Draw Trajectory View
  const drawTrajectory = useCallback(
    (dc: DrawContext) => {
      const { ctx, pad, plotW, plotH, bounds, toPxX, toPxY } = dc;
      const bMax = Math.max(
        Math.abs(magneticFieldAtX(bounds.xMin)),
        Math.abs(magneticFieldAtX(bounds.xMax)),
        1.5
      );

      // 1. B(x) vertical color gradient strip
      const cols = Math.min(200, Math.ceil(plotW / 3));
      const stripW = plotW / cols + 0.8;
      for (let i = 0; i < cols; i++) {
        const px = pad.left + (i / cols) * plotW;
        const xData = bounds.xMin + ((i + 0.5) / cols) * (bounds.xMax - bounds.xMin);
        ctx.fillStyle = bFieldColor(magneticFieldAtX(xData), bMax);
        ctx.fillRect(px, pad.top, stripW, plotH);
      }

      // Re-draw crisp subtle gridlines on top of B(x) tint
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.06)';
      ctx.lineWidth = 1;
      if (bounds.xMin < 0 && bounds.xMax > 0) {
        const px0 = toPxX(0);
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.25)';
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(px0, pad.top);
        ctx.lineTo(px0, pad.top + plotH);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#334155';
        ctx.font = '600 11px "IBM Plex Mono", monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText('B = 0', px0 + 6, pad.top + 8);
      }

      // 2. Turning points vertical dashed lines
      for (const xt of summary.turningPointsX) {
        const pxt = toPxX(xt);
        ctx.save();
        ctx.strokeStyle = '#d97706';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(pxt, pad.top);
        ctx.lineTo(pxt, pad.top + plotH);
        ctx.stroke();
        ctx.fillStyle = '#b45309';
        ctx.font = '600 11px "IBM Plex Mono", monospace';
        ctx.textAlign = xt >= 0 ? 'right' : 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText(
          `x_m = ${xt.toFixed(1)} nm`,
          xt >= 0 ? pxt - 5 : pxt + 5,
          pad.top + plotH - 8
        );
        ctx.restore();
      }

      const maxIdx = Math.min(points.length - 1, Math.floor(currentTimePs / DT_PS));

      // 3. Electron Beam Mode trails
      if (beamMode && beamTrajectories.length > 0) {
        for (let bIdx = 0; bIdx < beamTrajectories.length; bIdx++) {
          const traj = beamTrajectories[bIdx];
          const isCenter = bIdx === Math.floor(beamTrajectories.length / 2);
          ctx.beginPath();
          const bStep = traj[1].t - traj[0].t;
          const bMaxIdx = Math.min(traj.length - 1, Math.floor(currentTimePs / bStep));
          for (let i = 0; i <= bMaxIdx; i++) {
            const px = toPxX(traj[i].x);
            const py = toPxY(traj[i].y);
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.strokeStyle = isCenter ? '#1d4ed8' : 'rgba(13, 148, 136, 0.48)';
          ctx.lineWidth = isCenter ? 2.2 : 1.25;
          ctx.stroke();

          const tip = interpolatePointAtTime(traj, currentTimePs);
          ctx.beginPath();
          ctx.arc(toPxX(tip.x), toPxY(tip.y), isCenter ? 5 : 3.2, 0, Math.PI * 2);
          ctx.fillStyle = isCenter ? '#1d4ed8' : '#0d9488';
          ctx.fill();
        }
      } else {
        // Faint full trajectory preview
        ctx.beginPath();
        for (let i = 0; i < points.length; i += 2) {
          const px = toPxX(points[i].x);
          const py = toPxY(points[i].y);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.strokeStyle = 'rgba(37, 99, 235, 0.2)';
        ctx.lineWidth = 1.4;
        ctx.stroke();

        // Active animated trajectory up to t
        ctx.beginPath();
        for (let i = 0; i <= maxIdx; i += 2) {
          const px = toPxX(points[i].x);
          const py = toPxY(points[i].y);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.lineTo(toPxX(currentPoint.x), toPxY(currentPoint.y));
        ctx.strokeStyle = '#1d4ed8';
        ctx.lineWidth = 2.4;
        ctx.stroke();

        // Start point marker
        ctx.beginPath();
        ctx.arc(toPxX(ic.x0Nm), toPxY(ic.y0Nm), 4, 0, Math.PI * 2);
        ctx.fillStyle = '#0f172a';
        ctx.fill();

        // Velocity arrow at current position
        const cpx = toPxX(currentPoint.x);
        const cpy = toPxY(currentPoint.y);
        if (summary.v0 > 1e-6) {
          const arrowLen = 28;
          const vxNorm = currentPoint.vx / summary.v0;
          const vyNorm = currentPoint.vy / summary.v0;
          const tipX = cpx + vxNorm * arrowLen;
          const tipY = cpy - vyNorm * arrowLen;
          ctx.strokeStyle = '#dc2626';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(cpx, cpy);
          ctx.lineTo(tipX, tipY);
          ctx.stroke();
        }

        // Animated electron dot
        ctx.beginPath();
        ctx.arc(cpx, cpy, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#1d4ed8';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
      }
    },
    [points, currentTimePs, currentPoint, summary, ic.x0Nm, ic.y0Nm, beamMode, beamTrajectories]
  );

  // Draw Phase Portrait
  const drawPhase = useCallback(
    (dc: DrawContext) => {
      const { ctx, toPxX, toPxY } = dc;
      const maxIdx = Math.min(points.length - 1, Math.floor(currentTimePs / DT_PS));

      if (phaseMode === 'vx-vy') {
        // Constant speed reference circle v_x^2 + v_y^2 = v_0^2
        if (summary.v0 > 0) {
          const steps = 160;
          ctx.beginPath();
          for (let i = 0; i <= steps; i++) {
            const ang = (i / steps) * Math.PI * 2;
            const px = toPxX(summary.v0 * Math.cos(ang));
            const py = toPxY(summary.v0 * Math.sin(ang));
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.strokeStyle = '#94a3b8';
          ctx.lineWidth = 1.3;
          ctx.setLineDash([5, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        if (beamMode && beamTrajectories.length > 0) {
          for (let bIdx = 0; bIdx < beamTrajectories.length; bIdx++) {
            const traj = beamTrajectories[bIdx];
            const isCenter = bIdx === Math.floor(beamTrajectories.length / 2);
            const tip = interpolatePointAtTime(traj, currentTimePs);
            ctx.beginPath();
            ctx.arc(toPxX(tip.vx), toPxY(tip.vy), isCenter ? 5.5 : 3.5, 0, Math.PI * 2);
            ctx.fillStyle = isCenter ? '#1d4ed8' : '#0d9488';
            ctx.fill();
          }
        } else {
          ctx.beginPath();
          for (let i = 0; i <= maxIdx; i += 2) {
            const px = toPxX(points[i].vx);
            const py = toPxY(points[i].vy);
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.strokeStyle = '#1d4ed8';
          ctx.lineWidth = 2.2;
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(toPxX(currentPoint.vx), toPxY(currentPoint.vy), 6, 0, Math.PI * 2);
          ctx.fillStyle = '#dc2626';
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = '#ffffff';
          ctx.stroke();
        }
      } else {
        // xdot - x phase portrait
        // Turning point markers on x-axis
        for (const xt of summary.turningPointsX) {
          ctx.beginPath();
          ctx.arc(toPxX(xt), toPxY(0), 4.5, 0, Math.PI * 2);
          ctx.fillStyle = '#d97706';
          ctx.fill();
        }

        if (beamMode && beamTrajectories.length > 0) {
          for (let bIdx = 0; bIdx < beamTrajectories.length; bIdx++) {
            const traj = beamTrajectories[bIdx];
            const isCenter = bIdx === Math.floor(beamTrajectories.length / 2);
            ctx.beginPath();
            for (let i = 0; i < traj.length; i += 2) {
              const px = toPxX(traj[i].x);
              const py = toPxY(traj[i].vx);
              if (i === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
            }
            ctx.strokeStyle = isCenter ? '#1d4ed8' : 'rgba(13, 148, 136, 0.45)';
            ctx.lineWidth = isCenter ? 2 : 1.1;
            ctx.stroke();

            const tip = interpolatePointAtTime(traj, currentTimePs);
            ctx.beginPath();
            ctx.arc(toPxX(tip.x), toPxY(tip.vx), isCenter ? 5.5 : 3.2, 0, Math.PI * 2);
            ctx.fillStyle = isCenter ? '#1d4ed8' : '#0d9488';
            ctx.fill();
          }
        } else {
          // Faint full orbit
          ctx.beginPath();
          for (let i = 0; i < points.length; i += 2) {
            const px = toPxX(points[i].x);
            const py = toPxY(points[i].vx);
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.strokeStyle = 'rgba(37, 99, 235, 0.2)';
          ctx.lineWidth = 1.4;
          ctx.stroke();

          ctx.beginPath();
          for (let i = 0; i <= maxIdx; i += 2) {
            const px = toPxX(points[i].x);
            const py = toPxY(points[i].vx);
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.strokeStyle = '#1d4ed8';
          ctx.lineWidth = 2.4;
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(toPxX(currentPoint.x), toPxY(currentPoint.vx), 6, 0, Math.PI * 2);
          ctx.fillStyle = '#dc2626';
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = '#ffffff';
          ctx.stroke();
        }
      }
    },
    [phaseMode, points, currentTimePs, currentPoint, summary, beamMode, beamTrajectories]
  );

  // Draw Energy Profile V(x) & E
  const drawEnergy = useCallback(
    (dc: DrawContext) => {
      const { ctx, pad, plotW, plotH, bounds, toPxX, toPxY } = dc;
      const samples = 320;

      // Shade classically allowed kinetic energy region between E and V(x)
      ctx.beginPath();
      let startedFill = false;
      const allowedPts: { px: number; pyV: number }[] = [];
      for (let i = 0; i <= samples; i++) {
        const x = bounds.xMin + (i / samples) * (bounds.xMax - bounds.xMin);
        const v = effectivePotentialMeV(x, summary.alpha);
        if (v <= ic.energyMeV) {
          allowedPts.push({ px: toPxX(x), pyV: toPxY(v) });
        } else if (allowedPts.length > 1) {
          const pyE = toPxY(ic.energyMeV);
          ctx.moveTo(allowedPts[0].px, pyE);
          for (const pt of allowedPts) ctx.lineTo(pt.px, pt.pyV);
          ctx.lineTo(allowedPts[allowedPts.length - 1].px, pyE);
          ctx.closePath();
          startedFill = true;
          allowedPts.length = 0;
        } else {
          allowedPts.length = 0;
        }
      }
      if (allowedPts.length > 1) {
        const pyE = toPxY(ic.energyMeV);
        ctx.moveTo(allowedPts[0].px, pyE);
        for (const pt of allowedPts) ctx.lineTo(pt.px, pt.pyV);
        ctx.lineTo(allowedPts[allowedPts.length - 1].px, pyE);
        ctx.closePath();
        startedFill = true;
      }
      if (startedFill) {
        ctx.fillStyle = 'rgba(37, 99, 235, 0.1)';
        ctx.fill();
      }

      // Draw V(x, alpha)
      ctx.beginPath();
      for (let i = 0; i <= samples; i++) {
        const x = bounds.xMin + (i / samples) * (bounds.xMax - bounds.xMin);
        const v = effectivePotentialMeV(x, summary.alpha);
        const px = toPxX(x);
        const py = toPxY(v);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2.4;
      ctx.stroke();

      // Total energy horizontal line
      const pyTotalE = toPxY(ic.energyMeV);
      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth = 1.8;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(pad.left, pyTotalE);
      ctx.lineTo(pad.left + plotW, pyTotalE);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#dc2626';
      ctx.font = '600 11px "IBM Plex Mono", monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`E = ${ic.energyMeV.toFixed(2)} meV`, pad.left + 8, pyTotalE - 4);

      // Turning point vertical drop lines
      for (const xt of summary.turningPointsX) {
        const pxt = toPxX(xt);
        ctx.strokeStyle = '#d97706';
        ctx.lineWidth = 1.3;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(pxt, pyTotalE);
        ctx.lineTo(pxt, pad.top + plotH);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.beginPath();
        ctx.arc(pxt, pyTotalE, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = '#d97706';
        ctx.fill();
      }

      // Animated particle state in E-x
      const cpx = toPxX(currentPoint.x);
      const cpyV = toPxY(currentPoint.potentialMeV);
      ctx.strokeStyle = '#0d9488';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cpx, pyTotalE);
      ctx.lineTo(cpx, cpyV);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cpx, pyTotalE, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = '#1d4ed8';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cpx, cpyV, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#0d9488';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      if (beamMode && beamTrajectories.length > 0) {
        for (const traj of beamTrajectories) {
          const tip = interpolatePointAtTime(traj, currentTimePs);
          ctx.beginPath();
          ctx.arc(toPxX(tip.x), toPxY(ic.energyMeV), 3.2, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(13, 148, 136, 0.7)';
          ctx.fill();
        }
      }
    },
    [summary, ic.energyMeV, currentPoint, beamMode, beamTrajectories, currentTimePs]
  );

  // CSV Export handlers per sub-tab
  const handleExportCsv = () => {
    if (subTab === 'trajectory') {
      downloadCsv(
        'classical_trajectory.csv',
        ['t (ps)', 'x (nm)', 'y (nm)', 'vx (nm/ps)', 'vy (nm/ps)', 'B(x) (T)', 'E_k (meV)', 'V(x) (meV)'],
        points
          .filter((_, idx) => idx % 4 === 0)
          .map((p) => [
            p.t.toFixed(4),
            p.x.toFixed(4),
            p.y.toFixed(4),
            p.vx.toFixed(4),
            p.vy.toFixed(4),
            p.B.toFixed(5),
            p.kineticMeV.toFixed(5),
            p.potentialMeV.toFixed(5),
          ])
      );
    } else if (subTab === 'phase') {
      downloadCsv(
        `classical_phase_${phaseMode}.csv`,
        ['t (ps)', 'x (nm)', 'xdot=vx (nm/ps)', 'vy (nm/ps)', 'v0 (nm/ps)'],
        points
          .filter((_, idx) => idx % 4 === 0)
          .map((p) => [
            p.t.toFixed(4),
            p.x.toFixed(4),
            p.vx.toFixed(4),
            p.vy.toFixed(4),
            summary.v0.toFixed(4),
          ])
      );
    } else {
      const outerXm =
        summary.turningPointsX.length > 0
          ? Math.max(...summary.turningPointsX.map((v) => Math.abs(v)))
          : 120;
      const xLim = Math.max(150, outerXm * 1.45);
      const rows: (string | number)[][] = [];
      for (let i = 0; i <= 250; i++) {
        const x = -xLim + (i / 250) * 2 * xLim;
        const v = effectivePotentialMeV(x, summary.alpha);
        const kx = Math.max(0, ic.energyMeV - v);
        rows.push([x.toFixed(3), v.toFixed(5), ic.energyMeV.toFixed(5), kx.toFixed(5)]);
      }
      downloadCsv('classical_energy_profile.csv', ['x (nm)', 'V(x,alpha) (meV)', 'E_total (meV)', 'K_x (meV)'], rows);
    }
  };

  const bLegendMax = Math.max(
    Math.abs(magneticFieldAtX(TRAJECTORY_FIXED_BOUNDS.xMin)),
    Math.abs(magneticFieldAtX(TRAJECTORY_FIXED_BOUNDS.xMax)),
    1.5
  );

  const mechanismText = useMemo(() => {
    const regimeDesc =
      summary.regime === 'field-gradient'
        ? '目前處於「場梯度漂移」區間 (D < −1)：電子總能量低於 x = 0 的有效位能障壁，無法跨越 B = 0 界線，粒子在單側非均勻磁場中因曲率半徑隨 |x| 變化而產生單向 ∇B 漂移。'
        : summary.regime === 'infinity'
        ? '目前處於「∞ 型封閉軌跡」臨界條件 (D ≈ −0.65223)：粒子跨越 B = 0 零磁場線時，正向與負向 y 漂移積分完全抵消 (Δy = 0)，形成穩定封閉的 8 字型軌道。'
        : summary.regime === 'slow-snake'
        ? '目前處於「交叉緩步蛇行」區間 (−1 < D < −0.65223)：電子反覆穿越 x = 0 並發生磁偏轉反轉，但迴轉半徑較大的負 y 段略占優勢，產生淨 −y 慢速漂移。'
        : summary.regime === 'snake'
        ? '目前處於「蛇形態」區間 (−0.65223 < D < 0)：粒子跨越 B = 0 進行蛇行振盪，每個週期產生淨 +y 漂移並帶有特徵交錯環圈。'
        : summary.regime === 'wide'
        ? '目前處於「寬幅蛇行」區間 (D ≥ 0)：有效位能 V(x) 為單谷四次方勢阱，電子在寬幅區域高速往返並沿 +y 方向持續前進。'
        : '電子處於靜止狀態 (E = 0)。';

    if (subTab === 'trajectory') {
      return `${regimeDesc} 背景色階代表空間磁場 B(x) = B₀x/L（藍色為 B < 0、白色為 B = 0、暖橘色為 B > 0），黃色虛線標註動能完全轉化為 y 向有效位能時的轉向點 x_m。`;
    }
    if (subTab === 'phase') {
      return phaseMode === 'xdot-x'
        ? `${regimeDesc} 在 (x, ẋ) 相空間中，雙勢阱 (α < 0) 可出現內外雙轉向點或跨越原點的封閉相軌；單勢阱 (α ≥ 0) 則呈現單一封閉相環。`
        : `${regimeDesc} 由於純磁場勞倫茲力不作功，粒子速率恆守恆 (v_x² + v_y² = v₀²)，因此 (v_x, v_y) 相點必定嚴格落在半徑為 v₀ 的圓周上運動。`;
    }
    return `${regimeDesc} 有效位能 V(x, α) = ½m*(α + ½βx²)² 控制了 x 方向的束縛振盪：藍色陰影代表經典允許區間 (E ≥ V)，垂線長度即為 x 方向動能 K_x = ½m*ẋ²。`;
  }, [summary.regime, subTab, phaseMode]);

  return (
    <div className="space-y-6">
      {/* Equations of Motion Banner (Eq. 9 & Eq. 20) */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="text-sm font-bold text-slate-900">
            經典運動方程式（兩種推導路徑等價結果）
          </h2>
          <span className="text-xs text-slate-500">
            牛頓勞倫茲力推導 [式 (9)] 與哈密頓正則方程式推導 [式 (20)] 完全一致
          </span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
            <div className="text-xs font-semibold text-slate-600 mb-1">
              方法 A：牛頓力學與勞倫茲力 [式 (9)]
            </div>
            <MathBlock
              display
              tex="\begin{cases} \ddot{x} + \alpha\beta x + \frac{1}{2}\beta^2 x^3 = 0 \\ \dot{y} = \alpha + \frac{1}{2}\beta x^2 \end{cases}"
            />
          </div>
          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
            <div className="text-xs font-semibold text-slate-600 mb-1">
              方法 B：哈密頓正則方程式 [式 (20)]
            </div>
            <MathBlock
              display
              tex="\begin{cases} \ddot{x} + \alpha\beta x + \frac{1}{2}\beta^2 x^3 = 0 \\ \dot{y} = \alpha + \frac{1}{2}\beta x^2 \end{cases} \quad \left(\alpha = \frac{p_y}{m^*},\;\beta = \frac{eB_0}{m^*L}\right)"
            />
          </div>
        </div>
      </div>

      {/* Asymmetric Split Console: Left Controls + Right Stage */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Control Deck */}
        <aside className="lg:col-span-4 xl:col-span-3 bg-white border border-slate-200 rounded-xl p-4 space-y-5">
          {/* Scenario Presets */}
          <div data-tour="classical-presets" className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900 tracking-wide">
                物理情境預設
              </h3>
              <span className="text-xs text-slate-500">{summary.regimeLabel}</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {CLASSICAL_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset.id)}
                  className={`px-2.5 py-2 text-xs font-medium rounded-lg border text-left transition-colors cursor-pointer whitespace-nowrap truncate ${
                    activePresetId === preset.id
                      ? 'bg-blue-700 text-white border-blue-700'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                  title={preset.description}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <hr className="border-slate-200" />

          {/* Electron Beam Mode */}
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                <span>電子束模式</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                同步發射 9 道含 ±6° 発散角電子束
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={beamMode}
              onClick={() => setBeamMode((v) => !v)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                beamMode ? 'bg-teal-600' : 'bg-slate-300'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                  beamMode ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <hr className="border-slate-200" />

          {/* Initial Conditions Sliders + Direct Numeric Inputs */}
          <div data-tour="classical-ic" className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900 tracking-wide">
                初始條件設定
              </h3>
              <span className="text-[11px] text-slate-500">可滑動或直接輸入數值</span>
            </div>

            {/* Kinetic Energy */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label className="font-medium text-slate-700">動能 E</label>
                <CompactNumberInput
                  ariaLabel="動能 E"
                  value={ic.energyMeV}
                  min={0}
                  max={25}
                  step={0.1}
                  decimals={1}
                  unit="meV"
                  onChange={(val) => updateIc({ energyMeV: val })}
                />
              </div>
              <input
                type="range"
                min={0}
                max={25}
                step={0.1}
                value={ic.energyMeV}
                onChange={(e) => updateIc({ energyMeV: parseFloat(e.target.value) })}
                className="lab-slider w-full"
              />
              <div className="flex justify-between text-[10px] font-mono text-slate-400">
                <span>0 meV</span>
                <span>12.5</span>
                <span>25 meV</span>
              </div>
            </div>

            {/* Incident Angle */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label className="font-medium text-slate-700">入射角度 θ</label>
                <CompactNumberInput
                  ariaLabel="入射角度 θ"
                  value={ic.angleDeg}
                  min={-180}
                  max={180}
                  step={0.01}
                  decimals={2}
                  unit="°"
                  onChange={(val) => updateIc({ angleDeg: val })}
                />
              </div>
              <input
                type="range"
                min={-180}
                max={180}
                step={0.1}
                value={ic.angleDeg}
                onChange={(e) => updateIc({ angleDeg: parseFloat(e.target.value) })}
                className="lab-slider w-full"
              />
              <div className="flex flex-wrap gap-1 pt-0.5">
                {SPECIAL_ANGLES.map((ang) => (
                  <button
                    key={ang.label}
                    type="button"
                    onClick={() => updateIc({ angleDeg: ang.val })}
                    className={`px-2 py-1 text-[11px] font-mono rounded border transition-colors cursor-pointer ${
                      Math.abs(ic.angleDeg - ang.val) < 0.05
                        ? 'bg-blue-700 text-white border-blue-700'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {ang.label}
                  </button>
                ))}
              </div>
            </div>

            {/* x0 */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label className="font-medium text-slate-700">x 起始位置 x₀</label>
                <CompactNumberInput
                  ariaLabel="x 起始位置 x₀"
                  value={ic.x0Nm}
                  min={-120}
                  max={120}
                  step={1}
                  decimals={0}
                  unit="nm"
                  onChange={(val) => updateIc({ x0Nm: val })}
                />
              </div>
              <input
                type="range"
                min={-120}
                max={120}
                step={1}
                value={ic.x0Nm}
                onChange={(e) => updateIc({ x0Nm: parseFloat(e.target.value) })}
                className="lab-slider w-full"
              />
              <div className="flex justify-between text-[10px] font-mono text-slate-400">
                <span>-120 nm</span>
                <span>0</span>
                <span>120 nm</span>
              </div>
            </div>

            {/* y0 */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label className="font-medium text-slate-700">y 起始位置 y₀</label>
                <CompactNumberInput
                  ariaLabel="y 起始位置 y₀"
                  value={ic.y0Nm}
                  min={-100}
                  max={100}
                  step={1}
                  decimals={0}
                  unit="nm"
                  onChange={(val) => updateIc({ y0Nm: val })}
                />
              </div>
              <input
                type="range"
                min={-100}
                max={100}
                step={1}
                value={ic.y0Nm}
                onChange={(e) => updateIc({ y0Nm: parseFloat(e.target.value) })}
                className="lab-slider w-full"
              />
              <div className="flex justify-between text-[10px] font-mono text-slate-400">
                <span>-100 nm</span>
                <span>0</span>
                <span>100 nm</span>
              </div>
            </div>
          </div>

          <hr className="border-slate-200" />

          {/* Animation Time Controls */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs">
              <h3 className="font-bold text-slate-900">動畫時間控制</h3>
              <span className="font-mono text-slate-700">
                {currentTimePs.toFixed(2)} / {T_MAX_PS} ps
              </span>
            </div>

            <input
              type="range"
              min={0}
              max={T_MAX_PS}
              step={0.02}
              value={currentTimePs}
              onChange={(e) => setCurrentTimePs(parseFloat(e.target.value))}
              className="lab-slider w-full"
            />

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsPlaying((p) => !p)}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors cursor-pointer"
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                <span>{isPlaying ? '暫停' : '播放'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setCurrentTimePs(0);
                  setIsPlaying(true);
                }}
                className="inline-flex items-center justify-center gap-1 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>重設</span>
              </button>
            </div>

            <div className="flex items-center justify-between gap-1 pt-0.5">
              <span className="text-[11px] text-slate-500 shrink-0">調速</span>
              <div className="flex gap-1">
                {SPEED_OPTIONS.map((sp) => (
                  <button
                    key={sp}
                    type="button"
                    onClick={() => setPlaybackSpeed(sp)}
                    className={`px-2 py-1 text-[11px] font-mono rounded border transition-colors cursor-pointer ${
                      playbackSpeed === sp
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {sp}×
                  </button>
                ))}
              </div>
            </div>
          </div>
        </aside>

        {/* Right Main Viewport */}
        <div data-tour="classical-stage" className="lg:col-span-8 xl:col-span-9 space-y-5">
          {/* Sub-Tab Selector + Phase Sub-mode Toggle */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
              {[
                { id: 'trajectory' as const, label: '1. 粒子軌跡' },
                { id: 'phase' as const, label: '2. 相圖' },
                { id: 'energy' as const, label: '3. 能量分布圖 (E-x)' },
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

            {subTab === 'phase' && (
              <div className="inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
                <button
                  type="button"
                  onClick={() => setPhaseMode('xdot-x')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    phaseMode === 'xdot-x'
                      ? 'bg-white text-blue-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  ẋ - x 相圖
                </button>
                <button
                  type="button"
                  onClick={() => setPhaseMode('vx-vy')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    phaseMode === 'vx-vy'
                      ? 'bg-white text-blue-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  (vₓ, vᵧ) 速度空間圖
                </button>
              </div>
            )}
          </div>

          {/* Interactive Plot Stage */}
          {subTab === 'trajectory' && (
            <ScientificCanvas
              title="二維平面粒子軌跡與磁場 B(x) 色階分布"
              subtitle={`判別值 D = ${summary.D.toFixed(5)} · ${summary.regimeLabel}`}
              xLabel="x"
              yLabel="y"
              xUnit="nm"
              yUnit="nm"
              defaultBounds={TRAJECTORY_FIXED_BOUNDS}
              externalBounds={trajectoryFitBounds}
              externalBoundsKey={trajectoryFitKey}
              onResetView={() => setTrajectoryFitBounds(null)}
              extraActions={
                <button
                  type="button"
                  onClick={handleFitTrajectory}
                  title="自動適配當前軌跡範圍"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span>適配軌跡</span>
                </button>
              }
              onDraw={drawTrajectory}
              onExportCsv={handleExportCsv}
              pngFilename="classical_trajectory.png"
              heightClass="h-[480px]"
              legend={
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-4">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-4 h-0.5 bg-blue-700 inline-block" />
                      <span>電子軌跡</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-4 border-t-2 border-dashed border-amber-600 inline-block" />
                      <span>轉向點 x_m</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-4 h-0.5 bg-red-600 inline-block" />
                      <span>瞬時速度方向</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-2 font-mono text-[11px]">
                    <span>-{bLegendMax.toFixed(1)} T</span>
                    <div
                      className="w-28 h-2.5 rounded border border-slate-300"
                      style={{
                        background:
                          'linear-gradient(90deg, rgb(219,234,254) 0%, #ffffff 50%, rgb(254,232,214) 100%)',
                      }}
                    />
                    <span>+{bLegendMax.toFixed(1)} T (B_z)</span>
                  </div>
                </div>
              }
            />
          )}

          {subTab === 'phase' && (
            <ScientificCanvas
              title={
                phaseMode === 'xdot-x'
                  ? 'x 方向相空間軌跡 (ẋ vs x)'
                  : '速度空間軌跡 (vᵧ vs vₓ)'
              }
              subtitle={
                phaseMode === 'xdot-x'
                  ? '顯示電子於有效四次方勢阱中之位置與速度相圖'
                  : `總速率守恆 v₀ = ${summary.v0.toFixed(2)} nm/ps`
              }
              xLabel={phaseMode === 'xdot-x' ? 'x' : 'vₓ'}
              yLabel={phaseMode === 'xdot-x' ? 'ẋ (vₓ)' : 'vᵧ'}
              xUnit={phaseMode === 'xdot-x' ? 'nm' : 'nm/ps'}
              yUnit="nm/ps"
              defaultBounds={phaseDefaultBounds}
              lockAspect={phaseMode === 'vx-vy'}
              onDraw={drawPhase}
              onExportCsv={handleExportCsv}
              pngFilename={`classical_phase_${phaseMode}.png`}
              heightClass="h-[480px]"
              legend={
                <div className="flex flex-wrap items-center gap-4">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-4 h-0.5 bg-blue-700 inline-block" />
                    <span>相軌跡</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-600 inline-block" />
                    <span>當前相點</span>
                  </span>
                  {phaseMode === 'vx-vy' && (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-4 border-t border-dashed border-slate-500 inline-block" />
                      <span>等速率圓 v₀</span>
                    </span>
                  )}
                </div>
              }
            />
          )}

          {subTab === 'energy' && (
            <ScientificCanvas
              title="有效位能與能量分布圖 (E - x)"
              subtitle="V(x, α) = ½m*(α + ½βx²)² 與總能量水平線"
              xLabel="x"
              yLabel="能量 E / V(x)"
              xUnit="nm"
              yUnit="meV"
              defaultBounds={energyDefaultBounds}
              onDraw={drawEnergy}
              onExportCsv={handleExportCsv}
              pngFilename="classical_energy_profile.png"
              heightClass="h-[480px]"
              legend={
                <div className="flex flex-wrap items-center gap-4">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-4 h-0.5 bg-slate-900 inline-block" />
                    <span>有效位能 V(x, α)</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-4 border-t-2 border-dashed border-red-600 inline-block" />
                    <span>系統總能量 E</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-3 bg-blue-600/15 border border-blue-600/30 inline-block" />
                    <span>經典允許區 (Kₓ = E − V ≥ 0)</span>
                  </span>
                </div>
              }
            />
          )}

          {/* Info Blocks: Real-Time Parameters, System Parameters, Physics Explanation */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Real-time Parameters */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2.5">
              <h4 className="text-xs font-bold text-slate-900">即時動力學參數</h4>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                <dt className="text-slate-500">時間 t</dt>
                <dd className="font-mono text-right text-slate-900">{currentPoint.t.toFixed(3)} ps</dd>
                <dt className="text-slate-500">位置 (x, y)</dt>
                <dd className="font-mono text-right text-slate-900">
                  ({currentPoint.x.toFixed(1)}, {currentPoint.y.toFixed(1)}) nm
                </dd>
                <dt className="text-slate-500">速度 (vₓ, vᵧ)</dt>
                <dd className="font-mono text-right text-slate-900">
                  ({currentPoint.vx.toFixed(1)}, {currentPoint.vy.toFixed(1)})
                </dd>
                <dt className="text-slate-500">當地磁場 B(x)</dt>
                <dd className="font-mono text-right text-slate-900">{currentPoint.B.toFixed(3)} T</dd>
                <dt className="text-slate-500">x 向動能 Kₓ</dt>
                <dd className="font-mono text-right text-slate-900">
                  {Math.max(0, currentPoint.kineticMeV - currentPoint.potentialMeV).toFixed(3)} meV
                </dd>
                <dt className="text-slate-500">有效位能 V(x)</dt>
                <dd className="font-mono text-right text-slate-900">
                  {currentPoint.potentialMeV.toFixed(3)} meV
                </dd>
              </dl>
            </div>

            {/* System Parameters */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2.5">
              <h4 className="text-xs font-bold text-slate-900">系統結構與不變量參數</h4>
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
                <dt className="text-slate-500">動量參數 α</dt>
                <dd className="font-mono text-right text-slate-900">
                  {summary.alpha.toFixed(2)} nm/ps
                </dd>
                <dt className="text-slate-500">判別值 D = α/v₀</dt>
                <dd className="font-mono text-right text-blue-700 font-semibold">
                  {summary.D.toFixed(5)}
                </dd>
                <dt className="text-slate-500">週期漂移 Δy / T</dt>
                <dd className="font-mono text-right text-slate-900">
                  {summary.analyticalDeltaY !== null
                    ? `${summary.analyticalDeltaY.toFixed(1)} nm`
                    : '單側漂移'}
                  {periodT ? ` / ${periodT.toFixed(2)} ps` : ''}
                </dd>
              </dl>
            </div>

            {/* Physical Mechanism */}
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
