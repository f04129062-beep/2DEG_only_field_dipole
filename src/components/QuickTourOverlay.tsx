import { useEffect, useLayoutEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Compass, X } from 'lucide-react';

export interface TourStep {
  id: string;
  tab: 'classical' | 'quantum';
  selector: string;
  title: string;
  description: string;
  tip?: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'nav',
    tab: 'classical',
    selector: '[data-tour="main-nav"]',
    title: '歡迎使用磁場梯度電子動力學模擬平台',
    description:
      '本系統針對線性非均勻磁場 B(x) = (B₀x/L)k̂ 中的二維電子提供完整模擬。可於頂部切換「經典分頁」與「量子分頁」，或隨時開啟「推導講義參考」查閱完整 LaTeX 公式推導。',
    tip: '所有 6 個子分頁均支援滑鼠拖曳平移、滾輪縮放、匯出 CSV 數據與下載高解析度 PNG 圖片。',
  },
  {
    id: 'classical-presets',
    tab: 'classical',
    selector: '[data-tour="classical-presets"]',
    title: '經典物理情境預設與電子束模式',
    description:
      '點選預設按鈕可一鍵觀察五種代表性軌道：場梯度漂移 (D < −1)、蛇形態、寬幅蛇行、交叉緩步蛇行，以及零淨漂移的「∞ 型封閉軌跡」(D ≈ −0.65223)。',
    tip: '下方「電子束模式」可同步發射 9 道含 ±6° 發散角的電子束，觀察磁場梯度造成的聚焦與分岔現象。',
  },
  {
    id: 'classical-ic',
    tab: 'classical',
    selector: '[data-tour="classical-ic"]',
    title: '初始條件設定：滑桿、數值輸入與特殊角度',
    description:
      '可拖曳滑桿或直接在右側輸入框鍵入數值，精確設定動能 E (0–25 meV)、入射角 θ (-180°–180°) 與起始座標 (x₀, y₀)。下方提供 -135°、-90°、-45°、-40.71° (∞)、30°、60°、135° 等快捷角度按鈕。',
    tip: '在粒子軌跡圖中調整這些參數時，座標軸尺度會保持鎖定不跳動，方便直觀對比軌道變化。',
  },
  {
    id: 'classical-stage',
    tab: 'classical',
    selector: '[data-tour="classical-stage"]',
    title: '經典三大視圖與視野控制',
    description:
      '可自由切換「1. 粒子軌跡」（含 B(x) 色階與轉向點 x_m）、「2. 相圖」（ẋ-x 與 (vₓ, vᵧ) 速度圓切換）及「3. 能量分布圖 (E-x)」。工具列中「適配軌跡」可一鍵依當前軌道自動縮放，「重設畫面」則恢復標準參考座標。',
    tip: '左側底部提供播放/暫停、時間拖動條與 0.25×–4× 調速按鈕。',
  },
  {
    id: 'quantum-matrix',
    tab: 'quantum',
    selector: '[data-tour="quantum-matrix"]',
    title: '量子分頁：矩陣截斷維度與特徵尺度 ℓ',
    description:
      '系統將哈密頓量於厄米-高斯基底展開並依奇偶宇稱解耦對角化。可自由選擇 360 至 1080 維度檢驗收斂性，並可調整基底展幅尺度 ℓ 或一鍵恢復最佳理論值 ℓ₀ ≈ 39.79 nm。',
    tip: '可切換 E(α) 與 E(k_y) 座標軸，並選擇顯示 n=0 至 n=0...10 的能帶數。',
  },
  {
    id: 'quantum-bands',
    tab: 'quantum',
    selector: '[data-tour="quantum-bands-ctrl"]',
    title: '能帶色散圖選項、負區加密採樣與簡併標註',
    description:
      '能帶圖特別針對 α < 0 雙勢阱區域提供高密度採樣，以精確呈現穿隧劈裂與指數簡併重疊。可自由勾選「連接各點」、「繪製離散點」、「重點標註簡併重疊點」，並以滑桿調整點大小與手動設定 E-scale / x 軸範圍。',
  },
  {
    id: 'quantum-stage',
    tab: 'quantum',
    selector: '[data-tour="quantum-stage"]',
    title: '波函數疊加圖與量子運動方程式視圖',
    description:
      '於「2. 波函數與 E-x 圖」可拖曳 α / k_y 滑桿觀察雙勢阱局域態與單勢阱轉換，並手動調整 E-scale、ψ-scale 與 x 軸尺度；「3. 量子運動方程式視圖」則呈現埃倫費斯特定理推導與各能帶 ⟨x²⟩ₙ、群速度數值表。',
  },
];

interface QuickTourOverlayProps {
  open: boolean;
  stepIndex: number;
  onStepChange: (nextStep: number) => void;
  onSwitchTab: (tab: 'classical' | 'quantum') => void;
  onClose: () => void;
}

interface RectBox {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function QuickTourOverlay({
  open,
  stepIndex,
  onStepChange,
  onSwitchTab,
  onClose,
}: QuickTourOverlayProps) {
  const [targetRect, setTargetRect] = useState<RectBox | null>(null);
  const step = TOUR_STEPS[Math.max(0, Math.min(TOUR_STEPS.length - 1, stepIndex))];

  // Switch tab automatically when step requires it
  useEffect(() => {
    if (!open) return;
    onSwitchTab(step.tab);
  }, [open, step.tab, onSwitchTab]);

  // Measure target element rect after render/tab switch
  useLayoutEffect(() => {
    if (!open) {
      setTargetRect(null);
      return;
    }

    let cancelled = false;

    const updateRect = () => {
      if (cancelled) return;
      const el = document.querySelector(step.selector) as HTMLElement | null;
      if (!el) {
        setTargetRect(null);
        return;
      }
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        setTargetRect({
          top: r.top,
          left: r.left,
          width: r.width,
          height: r.height,
        });
      } else {
        setTargetRect(null);
      }
    };

    const rafId = requestAnimationFrame(updateRect);
    const timerId = window.setTimeout(updateRect, 80);
    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect, true);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      clearTimeout(timerId);
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect, true);
    };
  }, [open, stepIndex, step.selector]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowRight') {
        if (stepIndex < TOUR_STEPS.length - 1) onStepChange(stepIndex + 1);
        else onClose();
      } else if (e.key === 'ArrowLeft') {
        if (stepIndex > 0) onStepChange(stepIndex - 1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, stepIndex, onStepChange, onClose]);

  if (!open) return null;

  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const cardW = Math.min(400, vw - 32);
  const pad = 6;

  // Compute safe floating card position near spotlight
  let cardTop = Math.max(24, (vh - 280) / 2);
  let cardLeft = Math.max(16, (vw - cardW) / 2);

  if (targetRect) {
    const spaceBelow = vh - (targetRect.top + targetRect.height + pad);
    const spaceRight = vw - (targetRect.left + targetRect.width + pad);
    const spaceLeft = targetRect.left - pad;
    const spaceAbove = targetRect.top - pad;

    if (spaceRight >= cardW + 20) {
      cardLeft = targetRect.left + targetRect.width + 16;
      cardTop = Math.min(Math.max(16, targetRect.top), vh - 310);
    } else if (spaceLeft >= cardW + 20) {
      cardLeft = targetRect.left - cardW - 16;
      cardTop = Math.min(Math.max(16, targetRect.top), vh - 310);
    } else if (spaceBelow >= 240) {
      cardTop = targetRect.top + targetRect.height + 14;
      cardLeft = Math.min(Math.max(16, targetRect.left), vw - cardW - 16);
    } else if (spaceAbove >= 240) {
      cardTop = Math.max(16, targetRect.top - 255);
      cardLeft = Math.min(Math.max(16, targetRect.left), vw - cardW - 16);
    } else {
      // Fallback anchored nicely at bottom-right
      cardTop = Math.max(16, vh - 290);
      cardLeft = Math.max(16, vw - cardW - 24);
    }
  }

  const isFirst = stepIndex === 0;
  const isLast = stepIndex === TOUR_STEPS.length - 1;

  return (
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-label="快速導覽提示"
    >
      {/* Clickable backdrop when target not found */}
      {!targetRect && (
        <div
          className="fixed inset-0 bg-slate-950/55"
          onClick={onClose}
        />
      )}

      {/* Spotlight cutout frame */}
      {targetRect && (
        <>
          <div
            className="fixed inset-0"
            onClick={onClose}
          />
          <div
            className="fixed pointer-events-none rounded-xl border-2 border-blue-500 transition-all duration-200"
            style={{
              top: targetRect.top - pad,
              left: targetRect.left - pad,
              width: targetRect.width + pad * 2,
              height: targetRect.height + pad * 2,
              boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.56)',
            }}
          />
        </>
      )}

      {/* Floating Guide Card */}
      <div
        className="fixed z-10 bg-white border border-slate-200 rounded-xl shadow-2xl p-5 space-y-4 transition-all duration-200"
        style={{
          top: cardTop,
          left: cardLeft,
          width: cardW,
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Compass className="w-4 h-4 text-blue-700 shrink-0" />
            <span className="text-xs font-mono font-semibold text-blue-700">
              快速導覽 · 步驟 {stepIndex + 1} / {TOUR_STEPS.length}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="關閉快速導覽"
            className="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-bold text-slate-900 leading-snug">
            {step.title}
          </h3>
          <p className="text-xs leading-relaxed text-slate-600">
            {step.description}
          </p>
          {step.tip && (
            <p className="text-xs leading-relaxed text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-2.5">
              {step.tip}
            </p>
          )}
        </div>

        {/* Step progress bars */}
        <div className="flex items-center gap-1.5">
          {TOUR_STEPS.map((s, idx) => (
            <button
              key={s.id}
              type="button"
              aria-label={`跳至步驟 ${idx + 1}`}
              onClick={() => onStepChange(idx)}
              className={`h-1.5 flex-1 rounded-full transition-colors cursor-pointer ${
                idx === stepIndex
                  ? 'bg-blue-700'
                  : idx < stepIndex
                  ? 'bg-blue-300'
                  : 'bg-slate-200'
              }`}
            />
          ))}
        </div>

        {/* Navigation actions */}
        <div className="flex items-center justify-between gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
          >
            結束導覽
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isFirst}
              onClick={() => onStepChange(Math.max(0, stepIndex - 1))}
              className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                isFirst
                  ? 'text-slate-300 border-slate-200 cursor-not-allowed'
                  : 'text-slate-700 bg-white border-slate-200 hover:bg-slate-100 cursor-pointer'
              }`}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>上一步</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (isLast) onClose();
                else onStepChange(stepIndex + 1);
              }}
              className="inline-flex items-center gap-1 px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors cursor-pointer"
            >
              <span>{isLast ? '完成導覽' : '下一步'}</span>
              {!isLast && <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
