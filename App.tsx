
import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";

type ImageSize = "1K" | "2K" | "4K";
type Status = 'idle' | 'analyzing' | 'rendering';

const App: React.FC = () => {
  const [refImage, setRefImage] = useState<string | null>(null);
  const [lineartImage, setLineartImage] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState<string>("1:1");
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [dnaStream, setDnaStream] = useState<string>("");
  const [fidelity, setFidelity] = useState<number>(100);
  const [selectedSize, setSelectedSize] = useState<ImageSize>("1K");

  const refInputRef = useRef<HTMLInputElement>(null);
  const lineartInputRef = useRef<HTMLInputElement>(null);

  /**
   * 修复弹窗逻辑：
   * 1. 确保在用户交互上下文中直接触发
   * 2. 增加对 window.aistudio 的全局访问兼容性
   */
  const handleSelectKey = async () => {
    const aistudio = (window as any).aistudio;
    if (aistudio && typeof aistudio.openSelectKey === 'function') {
      try {
        await aistudio.openSelectKey();
        console.log("API Key dialog opened successfully.");
      } catch (err) {
        console.error("Critical: Failed to invoke API Key dialog.", err);
      }
    } else {
      console.warn("AI Studio SDK not detected. API Key selection might be unavailable.");
      // 如果环境不支持，至少给用户一个反馈
      alert("系统检测到当前环境无法弹出 API 密钥选择器，请检查是否在有效的 AI Studio 预览环境或正确配置了 SDK。");
    }
  };

  useEffect(() => {
    const initCheck = async () => {
      const aistudio = (window as any).aistudio;
      if (aistudio && typeof aistudio.hasSelectedApiKey === 'function') {
        const hasKey = await aistudio.hasSelectedApiKey();
        if (!hasKey && typeof aistudio.openSelectKey === 'function') {
          // 初始引导弹窗
          aistudio.openSelectKey().catch(() => {});
        }
      }
    };
    initCheck();
  }, []);

  const calculateAspectRatio = (width: number, height: number): string => {
    const ratio = width / height;
    if (ratio > 1.5) return "16:9";
    if (ratio > 1.2) return "4:3";
    if (ratio < 0.6) return "9:16";
    if (ratio < 0.8) return "3:4";
    return "1:1";
  };

  const processLineart = (dataUrl: string): Promise<{data: string, ratio: string}> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        const ratio = calculateAspectRatio(img.width, img.height);
        resolve({ data: canvas.toDataURL('image/png'), ratio: ratio });
      };
      img.src = dataUrl;
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'ref' | 'lineart') => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const data = event.target?.result as string;
      if (type === 'ref') {
        setRefImage(data);
        await auditNeuralDNA(data);
      } else {
        const processed = await processLineart(data);
        setLineartImage(processed.data);
        setAspectRatio(processed.ratio);
        setResultImage(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const auditNeuralDNA = async (imageData: string) => {
    setStatus('analyzing');
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [{
          parts: [
            { inlineData: { data: imageData.split(',')[1], mimeType: 'image/jpeg' } },
            { text: `[DETERMINISTIC DNA AUDIT] 提取此图色彩逻辑，包括确切HEX、渐变步长及阴影特性，作为填色唯一参考基准。` }
          ]
        }]
      });
      setDnaStream(response.text || "");
    } catch (err: any) {
      console.error("Audit Error:", err);
      if (err.message?.includes("Requested entity was not found")) {
        handleSelectKey();
      }
    } finally {
      setStatus('idle');
    }
  };

  const executeSynthesis = async () => {
    if (!lineartImage) return;
    setStatus('rendering');
    try {
      // 必须在点击时重新实例化以获取最新 API Key
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
      const prompt = `
        [DETERMINISTIC RENDERING ENGINE - V28]
        1. 严格锁定线稿，0像素偏移，禁止幻觉物体。
        2. 基于 [${dnaStream}] 注入高级线性渐变，禁止单色平涂。
        3. 阴影偏差控制在3%以内。
        4. 剔除艺术笔触，保持工业级纯净。
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: {
          parts: [
            { inlineData: { data: lineartImage.split(',')[1], mimeType: 'image/png' } },
            { text: prompt }
          ]
        },
        config: {
          imageConfig: { 
            // @ts-ignore
            aspectRatio: aspectRatio, 
            imageSize: selectedSize 
          }
        }
      });

      const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
      if (part?.inlineData) {
        setResultImage(`data:image/png;base64,${part.inlineData.data}`);
      }
    } catch (err: any) {
      console.error("Synthesis Error:", err);
      if (err.message?.includes("429") || err.message?.includes("not found")) {
        handleSelectKey();
      }
    } finally {
      setStatus('idle');
    }
  };

  return (
    <div className="h-screen bg-[#020202] text-[#a1a1aa] flex overflow-hidden font-sans">
      <aside className="w-[320px] lg:w-[400px] border-r border-white/5 bg-[#080808] p-8 flex flex-col gap-10 overflow-y-auto scrollbar-hide shrink-0 z-20">
        <header className="space-y-1">
          <h1 className="text-white text-2xl font-black tracking-[-0.05em] uppercase italic leading-none">
            COLOR LAYOUT<br/>
            <span className="text-emerald-500 text-sm tracking-[0.2em] font-black italic">AI SYSTEM</span>
          </h1>
          <p className="text-[7px] font-black text-white/20 uppercase tracking-[0.8em]">Absolute Fidelity V28</p>
        </header>

        <section className="space-y-8">
          <div className="space-y-4">
            <label className="text-[9px] font-black uppercase tracking-[0.4em] text-white/30">01. 风格 DNA 审计</label>
            <div onClick={() => refInputRef.current?.click()} className="aspect-square bg-white/[0.02] border border-white/10 rounded-[2rem] cursor-pointer hover:border-emerald-500/40 transition-all flex items-center justify-center overflow-hidden group">
              {refImage ? <img src={refImage} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-[2s]" /> : <div className="text-white/5 text-[10px] font-black tracking-widest uppercase">Style Reference</div>}
              <input ref={refInputRef} type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, 'ref')} />
            </div>
          </div>

          <div className="space-y-4">
            <label className="text-[9px] font-black uppercase tracking-[0.4em] text-white/30">02. 线稿 (比例锁: {aspectRatio})</label>
            <div onClick={() => lineartInputRef.current?.click()} className="aspect-video bg-white/[0.02] border border-white/10 rounded-[2rem] cursor-pointer hover:border-emerald-500/40 transition-all flex items-center justify-center overflow-hidden group">
              {lineartImage ? <img src={lineartImage} className="w-full h-full object-contain p-8 group-hover:scale-105 transition-transform duration-[2s]" /> : <div className="text-white/5 text-[10px] font-black tracking-widest uppercase">CAD Lineart</div>}
              <input ref={lineartInputRef} type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, 'lineart')} />
            </div>
          </div>
        </section>

        <section className="mt-auto space-y-8">
          <div className="space-y-4">
            <div className="flex justify-between items-end">
              <span className="text-[9px] font-black uppercase tracking-[0.4em] text-white/20">保真系数</span>
              <span className="text-white text-xl font-black italic">{fidelity}%</span>
            </div>
            <input type="range" min="0" max="100" value={fidelity} onChange={(e) => setFidelity(parseInt(e.target.value))} className="w-full h-1 bg-white/5 appearance-none accent-emerald-500 rounded-full cursor-pointer" />
          </div>

          <button onClick={executeSynthesis} disabled={status !== 'idle' || !lineartImage} className="w-full py-6 bg-white text-black text-[11px] font-black uppercase tracking-[0.8em] rounded-[1rem] hover:bg-emerald-500 hover:text-white transition-all shadow-2xl disabled:opacity-5">
            {status === 'rendering' ? '执行渲染中...' : '生成高级色彩布局'}
          </button>
        </section>
      </aside>

      <main className="flex-1 bg-[#020202] p-12 lg:p-20 flex flex-col items-center justify-center relative">
        <nav className="absolute top-12 left-12 right-12 flex justify-between items-center z-10">
          <div className="flex gap-4">
            {(['1K', '2K', '4K'] as ImageSize[]).map(s => (
              <button key={s} onClick={() => setSelectedSize(s)} className={`px-6 py-2 rounded-full text-[9px] font-black transition-all border ${selectedSize === s ? 'bg-white text-black border-white shadow-lg' : 'text-white/20 border-white/5 hover:border-white/20'}`}>{s} RENDER</button>
            ))}
          </div>
          <button 
            type="button"
            onClick={(e) => {
              e.preventDefault();
              handleSelectKey();
            }} 
            className="px-6 py-2 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded-full text-[9px] font-black hover:bg-emerald-500 hover:text-white transition-all uppercase tracking-widest cursor-pointer z-[100]"
          >
            引擎管理
          </button>
        </nav>

        <div className="w-full h-full max-w-7xl rounded-[4rem] border border-white/[0.03] bg-[#050505] flex items-center justify-center overflow-hidden relative shadow-[0_0_120px_rgba(0,0,0,0.6)] group">
          {status === 'analyzing' && (
            <div className="flex flex-col items-center gap-6 animate-pulse">
              <div className="text-emerald-500 text-[10px] font-black uppercase tracking-[1em]">DNA 色彩审计中...</div>
            </div>
          )}
          
          {status === 'rendering' && (
            <div className="flex flex-col items-center gap-10">
              <div className="w-20 h-20 border-[3px] border-white/5 border-t-emerald-500 rounded-full animate-spin"></div>
              <div className="text-white text-[11px] font-black uppercase tracking-[1em]">零幻觉保真渲染中</div>
            </div>
          )}

          {!resultImage && status === 'idle' && (
            <div className="opacity-[0.02] flex flex-col items-center gap-12 select-none pointer-events-none translate-y-12">
              <div className="text-[20rem] font-black italic tracking-tighter leading-none">CAD</div>
              <div className="text-[14px] tracking-[4em] font-black ml-[4em]">COLOR LAYOUT AI</div>
            </div>
          )}

          {resultImage && status === 'idle' && (
            <div className="w-full h-full flex items-center justify-center animate-reveal bg-white">
              <img src={resultImage} className="max-w-full max-h-full object-contain" />
              <div className="absolute inset-0 bg-black/98 opacity-0 group-hover:opacity-100 transition-all duration-700 flex flex-col items-center justify-center gap-10 backdrop-blur-3xl">
                <a href={resultImage} download="COLOR_LAYOUT.png" className="px-24 py-6 bg-white text-black rounded-full text-[14px] font-black uppercase tracking-[1em] hover:bg-emerald-500 hover:text-white transition-all transform scale-95 group-hover:scale-100 duration-1000">导出图纸</a>
                <button onClick={() => setResultImage(null)} className="text-[10px] text-white/20 hover:text-red-500 uppercase tracking-[0.8em] font-black">销毁会话</button>
              </div>
            </div>
          )}
        </div>

        <footer className="absolute bottom-12 flex gap-32 opacity-[0.02] text-[9px] font-black uppercase tracking-[1.5em] pointer-events-none">
          <span>Stochastic Noise Suppression</span>
          <span>Zero Hallucination Anchor</span>
          <span>Rigid Geometry Mapping</span>
        </footer>
      </main>

      <style>{`
        @keyframes reveal { 
          0% { opacity: 0; filter: blur(60px); transform: scale(1.08); } 
          100% { opacity: 1; filter: blur(0); transform: scale(1); } 
        }
        .animate-reveal { animation: reveal 1.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          height: 24px; width: 24px; border-radius: 50%;
          background: #fff; border: 6px solid #10b981;
          cursor: pointer; transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        input[type="range"]::-webkit-slider-thumb:hover { transform: scale(1.3); }
      `}</style>
    </div>
  );
};

export default App;
