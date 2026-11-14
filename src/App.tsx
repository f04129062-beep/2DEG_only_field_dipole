import { useState } from 'react';
import { BookOpen } from 'lucide-react';
import { ClassicalTab } from './components/ClassicalTab';
import { DerivationDrawer } from './components/DerivationDrawer';
import { MathBlock } from './components/MathBlock';
import { QuantumTab } from './components/QuantumTab';
import { QuickTourOverlay } from './components/QuickTourOverlay';

type MainTab = 'classical' | 'quantum';

export default function App() {
  const [activeTab, setActiveTab] = useState<MainTab>('classical');
  const [derivationOpen, setDerivationOpen] = useState<boolean>(false);
  const [tourOpen, setTourOpen] = useState<boolean>(false);
  const [tourStep, setTourStep] = useState<number>(0);

  const handleOpenTour = () => {
    setTourStep(0);
    setTourOpen(true);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Top Navigation Bar: 3-zone contract */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-xs border-b border-slate-200">
        <div
          data-tour="main-nav"
          className="max-w-[1440px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-8"
        >
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('classical');
            }}
            className="text-base sm:text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            磁場梯度電子動力學模擬
          </a>

          <nav className="flex items-center gap-6">
            <button
              type="button"
              onClick={() => setActiveTab('classical')}
              className={`py-4 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'classical'
                  ? 'border-blue-700 text-blue-700'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              經典分頁
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('quantum')}
              className={`py-4 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'quantum'
                  ? 'border-blue-700 text-blue-700'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              量子分頁
            </button>
            <button
              type="button"
              onClick={handleOpenTour}
              className="py-4 text-sm font-medium border-b-2 border-transparent text-slate-600 hover:text-blue-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              快速導覽
            </button>
          </nav>

          <div className="shrink-0">
            <button
              type="button"
              onClick={() => setDerivationOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>推導講義參考</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main id="top" className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-5 space-y-5">
        {/* Clean unboxed system parameters summary */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 border-b border-slate-200 pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-slate-700">
              線性非均勻磁場系統 <MathBlock tex="\vec{B}(x) = \frac{B_0 x}{L}\hat{k}" />
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">m* = 0.067 mₑ</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">B₀ = 1.65 T</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">L = 16π² nm</span>
          </div>
          <div className="text-slate-500">
            可於任一圖表拖曳平移、滾輪縮放、匯出 CSV 數據與下載高解析度圖片
          </div>
        </div>

        {activeTab === 'classical' ? <ClassicalTab /> : <QuantumTab />}
      </main>

      <DerivationDrawer
        open={derivationOpen}
        onClose={() => setDerivationOpen(false)}
      />

      <QuickTourOverlay
        open={tourOpen}
        stepIndex={tourStep}
        onStepChange={setTourStep}
        onSwitchTab={setActiveTab}
        onClose={() => setTourOpen(false)}
      />
    </div>
  );
}
