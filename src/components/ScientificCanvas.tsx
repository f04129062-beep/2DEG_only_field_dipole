import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Download, FileSpreadsheet, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { downloadCanvasPng } from '../utils/export';

export interface ViewportBounds {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export interface PlotPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface DrawContext {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  plotW: number;
  plotH: number;
  pad: PlotPadding;
  bounds: ViewportBounds;
  toPxX: (x: number) => number;
  toPxY: (y: number) => number;
  toDataX: (px: number) => number;
  toDataY: (py: number) => number;
}

interface ScientificCanvasProps {
  title: string;
  subtitle?: string;
  xLabel: string;
  yLabel: string;
  xUnit?: string;
  yUnit?: string;
  defaultBounds: ViewportBounds;
  externalBounds?: ViewportBounds | null;
  externalBoundsKey?: number;
  onResetView?: () => void;
  extraActions?: React.ReactNode;
  padding?: Partial<PlotPadding>;
  lockAspect?: boolean;
  onDraw: (dc: DrawContext) => void;
  onExportCsv?: () => void;
  pngFilename: string;
  heightClass?: string;
  legend?: React.ReactNode;
}

export function niceTicks(min: number, max: number, targetCount = 6): number[] {
  const span = max - min;
  if (!Number.isFinite(span) || span <= 0) return [min];
  const rawStep = span / Math.max(2, targetCount);
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  let step: number;
  if (norm < 1.5) step = 1 * mag;
  else if (norm < 3) step = 2 * mag;
  else if (norm < 7) step = 5 * mag;
  else step = 10 * mag;

  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 1e-6; v += step) {
    ticks.push(Math.abs(v) < step * 1e-9 ? 0 : Number(v.toPrecision(10)));
  }
  return ticks;
}

export function formatTick(val: number): string {
  if (val === 0) return '0';
  const abs = Math.abs(val);
  if (abs >= 1000 || abs < 0.01) return val.toExponential(2);
  if (abs >= 10) return Number(val.toFixed(1)).toString();
  if (abs >= 1) return Number(val.toFixed(2)).toString();
  return Number(val.toFixed(3)).toString();
}

export function ScientificCanvas({
  title,
  subtitle,
  xLabel,
  yLabel,
  xUnit = '',
  yUnit = '',
  defaultBounds,
  externalBounds = null,
  externalBoundsKey = 0,
  onResetView,
  extraActions,
  padding,
  lockAspect = false,
  onDraw,
  onExportCsv,
  pngFilename,
  heightClass = 'h-[470px]',
  legend,
}: ScientificCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [bounds, setBounds] = useState<ViewportBounds>(externalBounds ?? defaultBounds);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 800, h: 470 });
  const [cursorData, setCursorData] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const dragStartRef = useRef<{
    px: number;
    py: number;
    bounds: ViewportBounds;
  } | null>(null);

  const pad: PlotPadding = {
    top: padding?.top ?? 24,
    right: padding?.right ?? 24,
    bottom: padding?.bottom ?? 46,
    left: padding?.left ?? 64,
  };

  // Sync if externalBounds explicitly updates
  useEffect(() => {
    if (externalBounds) {
      setBounds(externalBounds);
    }
  }, [
    externalBounds?.xMin,
    externalBounds?.xMax,
    externalBounds?.yMin,
    externalBounds?.yMax,
    externalBoundsKey,
  ]);

  // Reset when defaultBounds reference changes meaningfully and no external override
  const prevDefaultRef = useRef<string>('');
  useEffect(() => {
    const key = `${defaultBounds.xMin.toFixed(4)},${defaultBounds.xMax.toFixed(4)},${defaultBounds.yMin.toFixed(4)},${defaultBounds.yMax.toFixed(4)}`;
    if (!externalBounds && key !== prevDefaultRef.current) {
      prevDefaultRef.current = key;
      setBounds(defaultBounds);
    }
  }, [defaultBounds, externalBounds]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(300, Math.floor(entry.contentRect.width));
        const h = Math.max(260, Math.floor(entry.contentRect.height));
        setSize({ w, h });
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const getEffectiveBounds = useCallback(
    (b: ViewportBounds, plotW: number, plotH: number): ViewportBounds => {
      if (!lockAspect || plotW <= 0 || plotH <= 0) return b;
      const xSpan = b.xMax - b.xMin;
      const ySpan = b.yMax - b.yMin;
      const targetAspect = plotW / plotH;
      const dataAspect = xSpan / ySpan;
      if (dataAspect < targetAspect) {
        const newXSpan = ySpan * targetAspect;
        const cx = 0.5 * (b.xMin + b.xMax);
        return { ...b, xMin: cx - 0.5 * newXSpan, xMax: cx + 0.5 * newXSpan };
      } else {
        const newYSpan = xSpan / targetAspect;
        const cy = 0.5 * (b.yMin + b.yMax);
        return { ...b, yMin: cy - 0.5 * newYSpan, yMax: cy + 0.5 * newYSpan };
      }
    },
    [lockAspect]
  );

  // Render canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Clear crisp white
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size.w, size.h);

    const plotW = Math.max(40, size.w - pad.left - pad.right);
    const plotH = Math.max(40, size.h - pad.top - pad.bottom);
    const eff = getEffectiveBounds(bounds, plotW, plotH);

    const toPxX = (x: number) =>
      pad.left + ((x - eff.xMin) / (eff.xMax - eff.xMin)) * plotW;
    const toPxY = (y: number) =>
      pad.top + (1 - (y - eff.yMin) / (eff.yMax - eff.yMin)) * plotH;
    const toDataX = (px: number) =>
      eff.xMin + ((px - pad.left) / plotW) * (eff.xMax - eff.xMin);
    const toDataY = (py: number) =>
      eff.yMin + (1 - (py - pad.top) / plotH) * (eff.yMax - eff.yMin);

    // Draw custom scene inside clipped plot region first (underlay + data)
    ctx.save();
    ctx.beginPath();
    ctx.rect(pad.left, pad.top, plotW, plotH);
    ctx.clip();

    // Subtle coordinate grid
    const xTicks = niceTicks(eff.xMin, eff.xMax, Math.max(4, Math.floor(plotW / 95)));
    const yTicks = niceTicks(eff.yMin, eff.yMax, Math.max(4, Math.floor(plotH / 70)));

    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 1;
    for (const xt of xTicks) {
      const px = toPxX(xt);
      ctx.beginPath();
      ctx.moveTo(px, pad.top);
      ctx.lineTo(px, pad.top + plotH);
      ctx.stroke();
    }
    for (const yt of yTicks) {
      const py = toPxY(yt);
      ctx.beginPath();
      ctx.moveTo(pad.left, py);
      ctx.lineTo(pad.left + plotW, py);
      ctx.stroke();
    }

    // Zero axes if inside view
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    if (eff.xMin < 0 && eff.xMax > 0) {
      const px0 = toPxX(0);
      ctx.beginPath();
      ctx.moveTo(px0, pad.top);
      ctx.lineTo(px0, pad.top + plotH);
      ctx.stroke();
    }
    if (eff.yMin < 0 && eff.yMax > 0) {
      const py0 = toPxY(0);
      ctx.beginPath();
      ctx.moveTo(pad.left, py0);
      ctx.lineTo(pad.left + plotW, py0);
      ctx.stroke();
    }

    onDraw({
      ctx,
      width: size.w,
      height: size.h,
      plotW,
      plotH,
      pad,
      bounds: eff,
      toPxX,
      toPxY,
      toDataX,
      toDataY,
    });

    ctx.restore();

    // Plot border frame
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.strokeRect(pad.left, pad.top, plotW, plotH);

    // Axis ticks & labels
    ctx.fillStyle = '#475569';
    ctx.font = '500 11px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const xt of xTicks) {
      const px = toPxX(xt);
      if (px >= pad.left + 8 && px <= pad.left + plotW - 8) {
        ctx.strokeStyle = '#94a3b8';
        ctx.beginPath();
        ctx.moveTo(px, pad.top + plotH);
        ctx.lineTo(px, pad.top + plotH + 4);
        ctx.stroke();
        ctx.fillText(formatTick(xt), px, pad.top + plotH + 7);
      }
    }

    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const yt of yTicks) {
      const py = toPxY(yt);
      if (py >= pad.top + 8 && py <= pad.top + plotH - 8) {
        ctx.strokeStyle = '#94a3b8';
        ctx.beginPath();
        ctx.moveTo(pad.left - 4, py);
        ctx.lineTo(pad.left, py);
        ctx.stroke();
        ctx.fillText(formatTick(yt), pad.left - 8, py);
      }
    }

    // X-axis title
    ctx.fillStyle = '#0f172a';
    ctx.font = '600 12px "Plus Jakarta Sans", "Noto Sans TC", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(xUnit ? `${xLabel} (${xUnit})` : xLabel, pad.left + plotW / 2, size.h - 4);

    // Y-axis title
    ctx.save();
    ctx.translate(14, pad.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(yUnit ? `${yLabel} (${yUnit})` : yLabel, 0, 0);
    ctx.restore();
  }, [size, bounds, pad.top, pad.right, pad.bottom, pad.left, getEffectiveBounds, onDraw, xLabel, yLabel, xUnit, yUnit]);

  const zoomBy = useCallback(
    (factor: number, anchorX?: number, anchorY?: number) => {
      setBounds((prev) => {
        const plotW = Math.max(40, size.w - pad.left - pad.right);
        const plotH = Math.max(40, size.h - pad.top - pad.bottom);
        const eff = getEffectiveBounds(prev, plotW, plotH);
        const cx = anchorX ?? 0.5 * (eff.xMin + eff.xMax);
        const cy = anchorY ?? 0.5 * (eff.yMin + eff.yMax);
        return {
          xMin: cx + (eff.xMin - cx) * factor,
          xMax: cx + (eff.xMax - cx) * factor,
          yMin: cy + (eff.yMin - cy) * factor,
          yMax: cy + (eff.yMax - cy) * factor,
        };
      });
    },
    [size, pad.left, pad.right, pad.top, pad.bottom, getEffectiveBounds]
  );

  const handleReset = useCallback(() => {
    if (onResetView) {
      onResetView();
      setBounds(defaultBounds);
    } else {
      setBounds(externalBounds ?? defaultBounds);
    }
  }, [onResetView, externalBounds, defaultBounds]);

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const plotW = Math.max(40, size.w - pad.left - pad.right);
    const plotH = Math.max(40, size.h - pad.top - pad.bottom);
    const eff = getEffectiveBounds(bounds, plotW, plotH);

    const dataX = eff.xMin + ((px - pad.left) / plotW) * (eff.xMax - eff.xMin);
    const dataY = eff.yMin + (1 - (py - pad.top) / plotH) * (eff.yMax - eff.yMin);
    const factor = e.deltaY > 0 ? 1.15 : 0.87;
    zoomBy(factor, dataX, dataY);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const plotW = Math.max(40, size.w - pad.left - pad.right);
    const plotH = Math.max(40, size.h - pad.top - pad.bottom);
    const eff = getEffectiveBounds(bounds, plotW, plotH);
    setIsDragging(true);
    dragStartRef.current = {
      px: e.clientX,
      py: e.clientY,
      bounds: eff,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const plotW = Math.max(40, size.w - pad.left - pad.right);
    const plotH = Math.max(40, size.h - pad.top - pad.bottom);
    const eff = getEffectiveBounds(bounds, plotW, plotH);

    if (px >= pad.left && px <= pad.left + plotW && py >= pad.top && py <= pad.top + plotH) {
      setCursorData({
        x: eff.xMin + ((px - pad.left) / plotW) * (eff.xMax - eff.xMin),
        y: eff.yMin + (1 - (py - pad.top) / plotH) * (eff.yMax - eff.yMin),
      });
    } else {
      setCursorData(null);
    }

    if (isDragging && dragStartRef.current) {
      const dxPx = e.clientX - dragStartRef.current.px;
      const dyPx = e.clientY - dragStartRef.current.py;
      const b0 = dragStartRef.current.bounds;
      const dxData = -(dxPx / plotW) * (b0.xMax - b0.xMin);
      const dyData = (dyPx / plotH) * (b0.yMax - b0.yMin);
      setBounds({
        xMin: b0.xMin + dxData,
        xMax: b0.xMax + dxData,
        yMin: b0.yMin + dyData,
        yMax: b0.yMax + dyData,
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setIsDragging(false);
    dragStartRef.current = null;
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      {/* Header toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 bg-slate-50/70">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-900 truncate">{title}</h3>
          {subtitle && (
            <p className="text-xs text-slate-500 mt-0.5 truncate">{subtitle}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => zoomBy(0.78)}
            title="放大"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ZoomIn className="w-3.5 h-3.5" />
            <span>放大</span>
          </button>
          <button
            type="button"
            onClick={() => zoomBy(1.28)}
            title="縮小"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ZoomOut className="w-3.5 h-3.5" />
            <span>縮小</span>
          </button>
          <button
            type="button"
            onClick={handleReset}
            title="重設畫面"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>重設畫面</span>
          </button>

          {extraActions}

          {onExportCsv && (
            <button
              type="button"
              onClick={onExportCsv}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-teal-600" />
              <span>匯出 CSV</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => downloadCanvasPng(canvasRef.current, pngFilename)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>下載圖片</span>
          </button>
        </div>
      </div>

      {/* Canvas stage */}
      <div
        ref={containerRef}
        className={`relative w-full ${heightClass} select-none bg-white`}
      >
        <canvas
          ref={canvasRef}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={() => {
            setCursorData(null);
            setIsDragging(false);
          }}
          className={`w-full h-full block ${isDragging ? 'cursor-grabbing' : 'cursor-crosshair'}`}
        />

        {/* Live crosshair coordinates */}
        {cursorData && (
          <div className="pointer-events-none absolute top-3 right-3 px-2.5 py-1 bg-white/95 border border-slate-200 rounded-md text-xs font-mono text-slate-700 shadow-xs">
            ({formatTick(cursorData.x)}
            {xUnit ? ` ${xUnit}` : ''}, {formatTick(cursorData.y)}
            {yUnit ? ` ${yUnit}` : ''})
          </div>
        )}
      </div>

      {legend && (
        <div className="px-4 py-2.5 border-t border-slate-200 bg-slate-50/50 text-xs text-slate-600">
          {legend}
        </div>
      )}
    </div>
  );
}
