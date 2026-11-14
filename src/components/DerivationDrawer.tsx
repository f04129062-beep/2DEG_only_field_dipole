import { useState } from 'react';
import { BookOpen, X } from 'lucide-react';
import { MathBlock } from './MathBlock';

interface DerivationDrawerProps {
  open: boolean;
  onClose: () => void;
}

const SECTIONS = [
  { id: 'system', label: '1. 系統結構' },
  { id: 'classical-a', label: '2. 經典方法 A (牛頓)' },
  { id: 'classical-b', label: '3. 經典方法 B (哈密頓)' },
  { id: 'alpha', label: '4. α 參數與初始條件' },
  { id: 'quantum', label: '5. 量子方法與 EOM' },
  { id: 'matrix', label: '6. 本徵態與帶狀矩陣' },
  { id: 'trajectory', label: '7. 經典軌跡與橢圓積分' },
  { id: 'infinity', label: '8. ∞ 型封閉軌跡條件' },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

export function DerivationDrawer({ open, onClose }: DerivationDrawerProps) {
  const [activeSection, setActiveSection] = useState<SectionId>('system');

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/35 backdrop-blur-[1px]">
      <div className="relative w-full max-w-4xl bg-white h-full shadow-2xl border-l border-slate-200 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2.5 min-w-0">
            <BookOpen className="w-5 h-5 text-blue-700 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900 truncate">
                理論推導講義參考
              </h2>
              <p className="text-xs text-slate-500 truncate">
                線性梯度磁場 <MathBlock tex="\vec{B}(x) = \frac{B_0 x}{L}\hat{k}" /> 之經典與量子完整推導
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
            <span>關閉</span>
          </button>
        </div>

        {/* Section Tabs */}
        <div className="px-6 py-2.5 border-b border-slate-200 bg-white flex flex-wrap gap-1.5">
          {SECTIONS.map((sec) => (
            <button
              key={sec.id}
              type="button"
              onClick={() => setActiveSection(sec.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeSection === sec.id
                  ? 'bg-blue-700 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {sec.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 text-sm leading-relaxed text-slate-700">
          {activeSection === 'system' && (
            <section className="space-y-4">
              <h3 className="text-lg font-bold text-slate-900">1. 系統結構與磁矢勢</h3>
              <p>
                考慮二維電子氣 (2DEG) 處於沿 <MathBlock tex="x" /> 方向線性變化的垂直磁場中，電子有效質量為{' '}
                <MathBlock tex="m^* = 0.067\,m_e" />，特徵磁場強度{' '}
                <MathBlock tex="B_0 = 1.65\text{ T}" />，特徵尺度{' '}
                <MathBlock tex="L = 16\pi^2\text{ nm}" />。磁場與朗道規範 (Landau gauge) 下的磁矢勢如下：
              </p>
              <MathBlock
                display
                tex="\vec{B}(x) = \frac{B_0 x}{L}\hat{k} \;\longrightarrow\; \vec{A}(x) = \frac{B_0 x^2}{2L}\hat{j} \quad \text{(式 1)}"
              />
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                <p className="font-semibold text-slate-900">關鍵特徵參數</p>
                <p>
                  系統沿 <MathBlock tex="y" /> 方向具有空間平移不變性，因此 <MathBlock tex="y" /> 方向的正則動量（共軛動量）{' '}
                  <MathBlock tex="p_y" /> 為守恆量。這使整個二維動力學與量子問題得以約化為含參數{' '}
                  <MathBlock tex="\alpha = p_y / m^*" /> 的一維有效四次方勢阱 (quartic potential) 問題。
                </p>
              </div>
            </section>
          )}

          {activeSection === 'classical-a' && (
            <section className="space-y-4">
              <h3 className="text-lg font-bold text-slate-900">2. 經典方法 A：牛頓力學與勞倫茲力</h3>
              <p>
                從牛頓第二定律結合勞倫茲力出發（電子電荷 <MathBlock tex="q = -e" />）：
              </p>
              <MathBlock
                display
                tex="\vec{F} = \vec{F}_B \;\longrightarrow\; m^*\vec{a} = -e\,\vec{v}\times\vec{B} \quad \text{(式 2)}"
              />
              <p>代入 <MathBlock tex="\vec{B}(x) = \frac{B_0 x}{L}\hat{k}" />，展開分量：</p>
              <MathBlock
                display
                tex="m^*\begin{pmatrix}\ddot{x}\\\ddot{y}\end{pmatrix} = -\frac{eB_0}{L}\begin{pmatrix}x\dot{y}\\-x\dot{x}\end{pmatrix} \quad \text{(式 3)}"
              />
              <MathBlock
                display
                tex="\begin{cases} m^*\ddot{x} = -\dfrac{eB_0}{L}x\dot{y} \\[6pt] m^*\ddot{y} = \dfrac{eB_0}{L}x\dot{x} \end{cases} \quad \text{(式 4)}"
              />
              <p>將第二式改寫為全微分形式，可知 <MathBlock tex="y" /> 方向遵守共軛動量守恆：</p>
              <MathBlock
                display
                tex="\frac{d}{dt}\left(m^*\dot{y} - \frac{eB_0}{2L}x^2\right) = 0 \;\Longrightarrow\; m^*\dot{y} - \frac{eB_0}{2L}x^2 = \text{const} = p_y \quad \text{(式 5–6)}"
              />
              <p>
                定義由初始條件決定的參數 <MathBlock tex="\alpha = \frac{p_y}{m^*}" /> 與由系統結構決定的參數{' '}
                <MathBlock tex="\beta = \frac{eB_0}{m^*L}" />，得 <MathBlock tex="\dot{y}" /> 完全表為 <MathBlock tex="x" /> 的函數：
              </p>
              <MathBlock display tex="\dot{y} = \alpha + \frac{1}{2}\beta x^2 \quad \text{(式 7)}" />
              <p>代回 <MathBlock tex="x" /> 方向方程式：</p>
              <MathBlock
                display
                tex="\ddot{x} = -\beta x\left(\alpha + \frac{1}{2}\beta x^2\right) = -\alpha\beta x - \frac{1}{2}\beta^2 x^3 \quad \text{(式 8)}"
              />
              <div className="p-4 rounded-lg bg-blue-50/70 border border-blue-200">
                <p className="font-semibold text-blue-950 mb-1">牛頓力學所得運動方程式 (式 9)</p>
                <MathBlock
                  display
                  tex="\begin{cases} \ddot{x} + \alpha\beta x + \frac{1}{2}\beta^2 x^3 = 0 \\[4pt] \dot{y} = \alpha + \frac{1}{2}\beta x^2 \end{cases}"
                />
              </div>
            </section>
          )}

          {activeSection === 'classical-b' && (
            <section className="space-y-4">
              <h3 className="text-lg font-bold text-slate-900">3. 經典方法 B：哈密頓力學與最小耦合</h3>
              <p>
                利用自由粒子最小耦合替換 (Minimal Coupling Substitution){' '}
                <MathBlock tex="\vec{p} \to \vec{p} - q\vec{A} = \vec{p} + e\vec{A}" /> 建構哈密頓量：
              </p>
              <MathBlock
                display
                tex="H = \frac{(\vec{p} + e\vec{A})^2}{2m^*} = \frac{p_x^2}{2m^*} + \frac{1}{2m^*}\left(p_y + \frac{eB_0}{2L}x^2\right)^2 \quad \text{(式 10–12)}"
              />
              <p>代入 <MathBlock tex="\alpha = p_y / m^*" /> 與 <MathBlock tex="\beta = eB_0 / (m^*L)" /> 化簡為：</p>
              <MathBlock
                display
                tex="H(p_x, p_y, x) = \frac{p_x^2}{2m^*} + \frac{1}{2}m^*\left(\alpha + \frac{1}{2}\beta x^2\right)^2 \quad \text{(式 13)}"
              />
              <p>套用四條哈密頓正則方程式：</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
                  <p className="font-semibold text-slate-900">1. x 方向第一正則方程</p>
                  <MathBlock display tex="\dot{x} = \frac{\partial H}{\partial p_x} = \frac{p_x}{m^*} \;\to\; p_x = m^*\dot{x} \quad \text{(式 14)}" />
                </div>
                <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
                  <p className="font-semibold text-slate-900">2. x 方向第二正則方程</p>
                  <MathBlock display tex="\dot{p}_x = -\frac{\partial H}{\partial x} = -m^*\beta x\left(\alpha + \frac{1}{2}\beta x^2\right) \;\to\; \ddot{x} = -\alpha\beta x - \frac{1}{2}\beta^2 x^3 \quad \text{(式 17)}" />
                </div>
                <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
                  <p className="font-semibold text-slate-900">3. y 方向第一正則方程</p>
                  <MathBlock display tex="\dot{y} = \frac{\partial H}{\partial p_y} = \alpha + \frac{1}{2}\beta x^2 \quad \text{(式 18)}" />
                </div>
                <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
                  <p className="font-semibold text-slate-900">4. y 方向第二正則方程</p>
                  <MathBlock display tex="\dot{p}_y = -\frac{\partial H}{\partial y} = 0 \;\Longrightarrow\; p_y = \text{const} \quad \text{(式 19)}" />
                </div>
              </div>
              <div className="p-4 rounded-lg bg-blue-50/70 border border-blue-200">
                <p className="font-semibold text-blue-950 mb-1">哈密頓力學所得運動方程式 (式 20)</p>
                <MathBlock
                  display
                  tex="\begin{cases} \ddot{x} + \alpha\beta x + \frac{1}{2}\beta^2 x^3 = 0 \\[4pt] \dot{y} = \alpha + \frac{1}{2}\beta x^2 \end{cases}"
                />
                <p className="text-xs text-blue-900 mt-1">式 (9) 與式 (20) 完全等價。</p>
              </div>
            </section>
          )}

          {activeSection === 'alpha' && (
            <section className="space-y-4">
              <h3 className="text-lg font-bold text-slate-900">4. α 參數與初始條件關係</h3>
              <p>設定電子於 <MathBlock tex="t = 0" /> 的初始位置與速度向量：</p>
              <MathBlock
                display
                tex="\vec{r}(0) = x_0\hat{i} + y_0\hat{j}, \qquad \vec{v}(0) = v_0\cos(\theta)\hat{i} + v_0\sin(\theta)\hat{j} \quad \text{(式 21)}"
              />
              <p>由給定動能 <MathBlock tex="E = \frac{1}{2}m^*v_0^2" /> 決定初速大小 <MathBlock tex="v_0 = \sqrt{\frac{2E}{m^*}}" />，因此：</p>
              <MathBlock
                display
                tex="\dot{y}(0) = \sqrt{\frac{2E}{m^*}}\sin(\theta) \quad \text{(式 24)}"
              />
              <p>代回共軛動量關係 <MathBlock tex="\alpha = \dot{y} - \frac{1}{2}\beta x^2" />，即得參數 <MathBlock tex="\alpha" />：</p>
              <MathBlock
                display
                tex="\alpha = \sqrt{\frac{2E}{m^*}}\sin(\theta) - \frac{1}{2}\beta x_0^2 \quad \text{(式 25)}"
              />
            </section>
          )}

          {activeSection === 'quantum' && (
            <section className="space-y-4">
              <h3 className="text-lg font-bold text-slate-900">5. 量子方法、TISE 與埃倫費斯特定理</h3>
              <p>
                忽略自旋時沿用哈密頓量，因 <MathBlock tex="y" /> 方向具平移對稱性，波函數呈平面波形式，使得{' '}
                <MathBlock tex="p_y = m^*\alpha = \hbar k_y" />。將 <MathBlock tex="x" /> 方向算符化{' '}
                <MathBlock tex="\hat{p}_x = -i\hbar\frac{d}{dx}" />，得不含時薛丁格方程式 (TISE)：
              </p>
              <MathBlock
                display
                tex="-\frac{\hbar^2}{2m^*}\frac{d^2\psi}{dx^2} + \frac{1}{2}m^*\left(\alpha + \frac{1}{2}\beta x^2\right)^2\psi = E\psi \quad \text{(式 29)}"
              />
              <p>有效位能展開為四次方勢阱：</p>
              <MathBlock
                display
                tex="V(x,\alpha) = \frac{1}{2}m^*\alpha^2 + \frac{1}{2}m^*\alpha\beta x^2 + \frac{1}{8}m^*\beta^2 x^4 \quad \text{(式 33)}"
              />
              <p>
                利用埃倫費斯特定理 <MathBlock tex="\frac{d\langle\hat{O}\rangle}{dt} = \frac{1}{i\hbar}\langle[\hat{O}, H]\rangle" />，逐一計算四個算符對易子：
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <MathBlock tex="[x, H] = \frac{i\hbar}{m^*}p_x \;\implies\; \langle p_x\rangle_n = m^*\frac{d\langle x\rangle_n}{dt}" /> (式 39)
                </li>
                <li>
                  <MathBlock tex="[p_x, H] = -i\hbar\frac{\partial V}{\partial x} = -i\hbar m^*\left(\alpha\beta x + \frac{1}{2}\beta^2 x^3\right) \;\implies\; \frac{d^2\langle x\rangle_n}{dt^2} = -\alpha\beta\langle x\rangle_n - \frac{1}{2}\beta^2\langle x^3\rangle_n" /> (式 47)
                </li>
                <li>
                  <MathBlock tex="[y, H] = i\hbar\frac{\partial V}{\partial p_y} = i\hbar\left(\alpha + \frac{1}{2}\beta x^2\right) \;\implies\; \frac{d\langle\hat{y}\rangle_n}{dt} = \alpha + \frac{1}{2}\beta\langle x^2\rangle_n" /> (式 51)
                </li>
                <li>
                  <MathBlock tex="[p_y, H] = 0 \;\implies\; \langle p_y\rangle = \text{const}" /> (式 53)
                </li>
              </ul>
              <div className="p-4 rounded-lg bg-blue-50/70 border border-blue-200">
                <p className="font-semibold text-blue-950 mb-1">量子運動方程式 (式 54)</p>
                <MathBlock
                  display
                  tex="\begin{cases} \dfrac{d^2\langle x\rangle_n}{dt^2} + \alpha\beta\langle x\rangle_n + \dfrac{1}{2}\beta^2\langle x^3\rangle_n = 0 \\[8pt] \dfrac{d\langle\hat{y}\rangle_n}{dt} = \alpha + \dfrac{1}{2}\beta\langle x^2\rangle_n \end{cases}"
                />
              </div>
            </section>
          )}

          {activeSection === 'matrix' && (
            <section className="space-y-4">
              <h3 className="text-lg font-bold text-slate-900">6. 本徵態展開與帶狀哈密頓矩陣</h3>
              <p>
                引入無因次座標 <MathBlock tex="\xi = x / \ell" />，選擇最佳特徵尺度{' '}
                <MathBlock tex="\ell_0 = \left(\frac{\hbar L}{e B_0}\right)^{1/3} \approx 39.79\text{ nm}" />{' '}
                使動能項與四次方勢阱項尺度平衡，降低截斷誤差：
              </p>
              <MathBlock
                display
                tex="K_x\frac{d^2\psi}{d\xi^2} + K_y\psi + V_1\xi^2\psi + V_2\xi^4\psi = E\psi \quad \text{(式 58)}"
              />
              <MathBlock
                display
                tex="K_x = -\frac{\hbar^2}{2m^*\ell^2},\quad K_y = \frac{1}{2}m^*\alpha^2,\quad V_1 = \frac{1}{2}m^*\alpha\beta\ell^2,\quad V_2 = \frac{1}{8}m^*\beta^2\ell^4"
              />
              <p>
                將波函數以標準正交厄米-高斯基底 <MathBlock tex="\psi(\xi) = \sum_{n} c_n \psi_n(\xi)" /> 展開，並引入升降算符{' '}
                <MathBlock tex="\xi = \frac{1}{\sqrt{2}}(\hat{a}+\hat{a}^\dagger)" />、
                <MathBlock tex="D = \frac{1}{\sqrt{2}}(\hat{a}-\hat{a}^\dagger)" />，得到僅耦合{' '}
                <MathBlock tex="\Delta n = 0, \pm 2, \pm 4" /> 的對稱五對角（可依奇偶宇稱解耦為兩個獨立區塊）矩陣元素：
              </p>
              <MathBlock
                display
                tex="H_{n,n} = \frac{\hbar^2}{2m^*\ell^2}\left(n+\frac{1}{2}\right) + \frac{1}{2}\left(n+\frac{1}{2}\right)m^*\alpha\beta\ell^2 + \frac{1}{2}m^*\alpha^2 + \frac{1}{8}\left(\frac{3}{2}n^2 + \frac{3}{2}n + \frac{3}{4}\right)m^*\beta^2\ell^4"
              />
              <MathBlock
                display
                tex="H_{n,n+2} = \sqrt{(n+1)(n+2)}\left(-\frac{\hbar^2}{4m^*\ell^2} + \frac{1}{4}m^*\alpha\beta\ell^2 + \frac{1}{8}\left(n+\frac{3}{2}\right)m^*\beta^2\ell^4\right)"
              />
              <MathBlock
                display
                tex="H_{n,n+4} = \frac{1}{32}\sqrt{(n+1)(n+2)(n+3)(n+4)}\,m^*\beta^2\ell^4"
              />
              <p className="text-xs text-slate-500">
                註：由 <MathBlock tex="\langle n|\xi^4|n\rangle = \frac{3}{2}n^2 + \frac{3}{2}n + \frac{3}{4}" />{' '}
                精確係數確保矩陣本徵值與基底尺度 <MathBlock tex="\ell" /> 無關並嚴格非負；由於僅存在偶數步長躍遷，矩陣自然分裂為偶宇稱 (<MathBlock tex="n=0,2,4,\dots" />) 與奇宇稱 (<MathBlock tex="n=1,3,5,\dots" />) 兩組獨立五對角矩陣。
              </p>
            </section>
          )}

          {activeSection === 'trajectory' && (
            <section className="space-y-4">
              <h3 className="text-lg font-bold text-slate-900">7. 經典軌跡、轉向點與橢圓積分漂移量</h3>
              <p>
                在純磁場中速率守恆：<MathBlock tex="v_x^2 + v_y^2 = v_0^2" />。當 <MathBlock tex="x" /> 方向速度為零（動能全轉為有效位能）時發生轉向：
              </p>
              <MathBlock
                display
                tex="E = V(x_m, \alpha) \;\implies\; x_m = \pm\sqrt{\frac{2v_0}{\beta}(1 - D)}, \qquad D \coloneqq \frac{\alpha}{v_0} = \sin(\theta) - \frac{\beta x_0^2}{2v_0} \quad \text{(式 95–96)}"
              />
              <p>
                若 <MathBlock tex="D < -1" />，粒子動能低於 <MathBlock tex="x=0" /> 中央勢壘，將出現內轉向點{' '}
                <MathBlock tex="x_{\min} = \sqrt{\frac{2v_0}{\beta}(-1-D)}" /> 而被束縛於單側磁場區域進行梯度漂移；當{' '}
                <MathBlock tex="D > -1" /> 時，一個 <MathBlock tex="x" /> 振盪週期內的 <MathBlock tex="y" /> 方向淨漂移量{' '}
                <MathBlock tex="\Delta y" /> 可透過變數變換寫為第一類與第二類完全橢圓積分：
              </p>
              <MathBlock
                display
                tex="\Delta y = 4\sqrt{\frac{2v_0}{\beta}}\frac{1}{\sqrt{1+D}}\left[(1+D)\,E\!\left(-\frac{1-D}{1+D}\right) - K\!\left(-\frac{1-D}{1+D}\right)\right] \quad \text{(式 103)}"
              />
            </section>
          )}

          {activeSection === 'infinity' && (
            <section className="space-y-4">
              <h3 className="text-lg font-bold text-slate-900">8. ∞ 型封閉軌跡超越方程條件</h3>
              <p>
                欲觸發零淨漂移之 <MathBlock tex="\infty" /> 型封閉週期軌跡，須要求 <MathBlock tex="\Delta y = 0" />：
              </p>
              <MathBlock
                display
                tex="(1+D)\,E\!\left(-\frac{1-D}{1+D}\right) - K\!\left(-\frac{1-D}{1+D}\right) = 0 \;\implies\; D = \frac{K\!\left(-\frac{1-D}{1+D}\right)}{E\!\left(-\frac{1-D}{1+D}\right)} - 1 \quad \text{(式 107–108)}"
              />
              <p>數值求解該超越方程得臨界判別值：</p>
              <MathBlock display tex="D \approx -0.65223 \quad \text{(式 109)}" />
              <p>對應初始條件關係與能量條件：</p>
              <MathBlock
                display
                tex="\sin(\theta) - \frac{\beta x_0^2}{2v_0} \approx -0.65223 \quad \Longleftrightarrow \quad E = \frac{e^2B_0^2}{8m^*L^2}\frac{x_0^4}{(\sin(\theta) + 0.65223)^2} \quad \text{(式 110–111)}"
              />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
