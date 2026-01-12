
import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";

type ImageSize = "1K" | "2K" | "4K";
type Status = 'idle' | 'analyzing' | 'rendering';

const App: React.FC = () => {
  const [refImage, setRefImage] = useState<string | null>(null);
  const [lineartImage, setLineartImage] = useState<string | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [styleDesc, setStyleDesc] = useState<string>("");
  const [selectedSize, setSelectedSize] = useState<ImageSize>("1K");
  const [styleStrength, setStyleStrength] = useState<number>(80);
  const [aspectRatio, setAspectRatio] = useState<"1:1" | "3:4" | "4:3" | "9:16" | "16:9">("1:1");
  
  // API Key 管理相关状态
  const [showKeyModal, setShowKeyModal] = useState<boolean>(false);
  const [inputKey, setInputKey] = useState<string>("");
  const [hasKey, setHasKey] = useState<boolean>(false);

  // 初始化检查本地存储的 Key
  useEffect(() => {
    const savedKey = localStorage.getItem('CAD_RENDER_API_KEY');
    if (savedKey && savedKey.length > 20) {
      setHasKey(true);
      setInputKey(savedKey);
    }
  }, []);

  const refInputRef = useRef<HTMLInputElement>(null);
  const lineartInputRef = useRef<HTMLInputElement>(null);

  const saveApiKey = () => {
    if (inputKey.trim().length < 10) {
      alert("请输入有效的 API Key");
      return;
    }
    localStorage.setItem('CAD_RENDER_API_KEY', inputKey.trim());
    setHasKey(true);
    setShowKeyModal(false);
  };

  const getActiveApiKey = () => {
    return localStorage.getItem('CAD_RENDER_API_KEY') || process.env.API_KEY || "";
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'ref' | 'lineart') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const data = event.target?.result as string;
      if (type === 'ref') {
        setRefImage(data);
        setStyleDesc("");
      } else {
        setLineartImage(data);
        setResultImage(null);
        const img = new Image();
        img.src = data;
        img.onload = () => {
          const r = img.width / img.height;
          if (r > 1.5) setAspectRatio("16:9");
          else if (r > 1.2) setAspectRatio("4:3");
          else if (r < 0.6) setAspectRatio("9:16");
          else if (r < 0.8) setAspectRatio("3:4");
          else setAspectRatio("1:1");
        };
      }
    };
    reader.readAsDataURL(file);
  };

  const analyzeStyle = async () => {
    if (!refImage) return;
    const apiKey = getActiveApiKey();
    if (!apiKey) {
      setShowKeyModal(true);
      return;
    }

    setStatus('analyzing');
    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [{
          parts: [
            { inlineData: { data: refImage.split(',')[1], mimeType: 'image/jpeg' } },
            { text: "Detailed architectural color analysis: Extract palette, materials, and lighting mood." }
          ]
        }],
        config: {
          thinkingConfig: { thinkingBudget: 2500 }
        }
      });
      setStyleDesc(response.text || "");
    } catch (err: any) {
      console.error(err);
      if (err.message?.includes("API_KEY_INVALID") || err.message?.includes("403")) {
        setHasKey(false);
        alert("API Key 效验失败，请检查是否输入正确且关联了付费项目。");
        setShowKeyModal(true);
      } else {
        alert("解析受阻，请检查网络连接或 API 额度。");
      }
    } finally {
      setStatus('idle');
    }
  };

  const renderLayout = async () => {
    if (!lineartImage || !styleDesc) return;
    const apiKey = getActiveApiKey();
    if (!apiKey) {
      setShowKeyModal(true);
      return;
    }

    setStatus('rendering');
    try {
      const ai = new GoogleGenAI({ apiKey });
      const prompt = `
        TASK: ARCHITECTURAL PLAN COLORIZATION
        STYLE REFERENCE: ${styleDesc}
        STRENGTH: ${styleStrength}%
        CONSTRAINT: TOPOLOGY LOCK. Preserving every line of the CAD input with absolute precision.
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
            aspectRatio: aspectRatio,
            imageSize: selectedSize
          }
        }
      });

      const part = response.candidates[0].content.parts.find(p => p.inlineData);
      if (part?.inlineData) {
        setResultImage(`data:image/png;base64,${part.inlineData.data}`);
      }
    } catch (err: any) {
      console.error(err);
      alert(`生成失败: ${err.message || '未知错误'}`);
    } finally {
      setStatus('idle');
    }
  };

  return (
    <div className="min-h-screen bg-[#0d0d0f] text-slate-400 font-sans selection:bg-blue-600/30">
      {/* API Key Modal */}
      {showKeyModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 backdrop-blur-md bg-black/60">
          <div className="bg-[#1a1a1e] border border-white/10 rounded-[2.5rem] p-10 max-w-md w-full shadow-2xl animate-in fade-in zoom-in duration-300">
            <h3 className="text-white text-xl font-bold tracking-tight mb-2">配置 API 秘钥</h3>
            <p className="text-slate-500 text-xs mb-8 leading-relaxed">请输入您的 Google Gemini API Key。该秘钥将仅存储在您的浏览器本地，用于驱动高精度图像生成引擎。</p>
            
            <div className="space-y-6">
              <div className="relative group">
                <input 
                  type="password" 
                  value={inputKey}
                  onChange={(e) => setInputKey(e.target.value)}
                  placeholder="AIzaSy..." 
                  className="w-full bg-black/40 border border-white/5 rounded-2xl px-6 py-4 text-white text-sm focus:outline-none focus:border-blue-500/50 transition-all placeholder:opacity-20"
                />
                <div className="absolute inset-0 rounded-2xl bg-blue-500/5 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity"></div>
              </div>
              
              <div className="flex gap-4">
                <button 
                  onClick={() => setShowKeyModal(false)}
                  className="flex-1 py-4 bg-white/5 hover:bg-white/10 text-white text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all"
                >
                  取消
                </button>
                <button 
                  onClick={saveApiKey}
                  className="flex-[2] py-4 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all shadow-lg shadow-blue-600/20"
                >
                  确认保存
                </button>
              </div>
              <p className="text-[9px] text-center text-slate-600 uppercase tracking-tighter">
                尚未拥有 Key？<a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">去 AI Studio 免费获取</a>
              </p>
            </div>
          </div>
        </div>
      )}

      <nav className="border-b border-white/5 bg-black/40 backdrop-blur-xl sticky top-0 z-50 px-10 py-5 flex justify-between items-center">
        <div className="flex items-center gap-6">
          <div className="flex flex-col">
            <h1 className="text-white text-xl font-bold tracking-tighter leading-none uppercase">
              Precision<span className="text-blue-500">Render</span>
            </h1>
            <span className="text-[9px] uppercase tracking-[0.4em] text-slate-500 font-black mt-1">Architecture Visualization Engine</span>
          </div>
        </div>
        
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${hasKey ? 'bg-emerald-500 shadow-[0_0_10px_#10b981]' : 'bg-red-500 animate-pulse'}`}></div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{hasKey ? 'Engine Linked' : 'Key Missing'}</span>
          </div>
          <div className="flex flex-col items-end">
            <button 
              onClick={() => setShowKeyModal(true)} 
              className="px-5 py-2 bg-white/5 hover:bg-white/10 rounded-full text-[10px] font-black uppercase tracking-widest transition-all border border-white/10"
            >
              {hasKey ? '更改 API 秘钥' : '配置付费 API 秘钥'}
            </button>
            <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="text-[7px] text-slate-600 mt-1 hover:text-blue-500 transition-colors uppercase tracking-tighter">
              需要关联付费项目 (Billing Required)
            </a>
          </div>
        </div>
      </nav>

      <main className="max-w-[1800px] mx-auto p-10 grid grid-cols-1 lg:grid-cols-3 gap-10 h-[calc(100vh-140px)]">
        {/* Step 1: Style Reference */}
        <section className="bg-[#16161a] rounded-[2rem] border border-white/5 p-8 flex flex-col shadow-2xl overflow-hidden group">
          <header className="flex justify-between items-center mb-6">
            <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-blue-500">01. 风格参考 / Reference</h2>
            <div className="w-2 h-2 rounded-full bg-blue-500/20 group-hover:bg-blue-500 transition-colors"></div>
          </header>
          
          <div 
            onClick={() => refInputRef.current?.click()}
            className="flex-1 bg-black/40 rounded-3xl border border-white/5 border-dashed hover:border-blue-500/30 transition-all cursor-pointer flex items-center justify-center relative overflow-hidden mb-6"
          >
            {refImage ? (
              <img src={refImage} className="max-w-full max-h-full object-contain p-2" alt="Style Ref" />
            ) : (
              <div className="text-center opacity-20 group-hover:opacity-40 transition-all">
                <div className="text-4xl mb-3">◰</div>
                <p className="text-[9px] font-black uppercase tracking-[0.2em]">点击上传 参考彩平图</p>
              </div>
            )}
            <input ref={refInputRef} type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, 'ref')} />
          </div>

          <div className="space-y-4">
            <div className="bg-black/20 rounded-2xl p-5 border border-white/5 min-h-[120px]">
              <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest block mb-2">风格基因序列 / Style DNA:</span>
              {styleDesc ? (
                <p className="text-[10px] text-slate-400 leading-relaxed italic">{styleDesc}</p>
              ) : (
                <div className="flex flex-col items-center justify-center pt-4 opacity-30">
                  <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden mb-2"></div>
                  <div className="w-2/3 h-1 bg-white/5 rounded-full overflow-hidden"></div>
                </div>
              )}
            </div>
            <button 
              onClick={analyzeStyle}
              disabled={!refImage || status === 'analyzing'}
              className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-black uppercase tracking-[0.3em] rounded-2xl transition-all shadow-xl shadow-blue-600/20 disabled:opacity-10 active:scale-95"
            >
              {status === 'analyzing' ? '深度解析中...' : '启动风格解析'}
            </button>
          </div>
        </section>

        {/* Step 2: CAD Lineart */}
        <section className="bg-[#16161a] rounded-[2rem] border border-white/5 p-8 flex flex-col shadow-2xl">
          <header className="flex justify-between items-center mb-6">
            <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-emerald-500">02. CAD 线稿 / Structural</h2>
            <div className="flex gap-2">
              {(['1K', '2K', '4K'] as ImageSize[]).map(size => (
                <button 
                  key={size}
                  onClick={() => setSelectedSize(size)}
                  className={`px-3 py-1 rounded-lg text-[9px] font-black transition-all ${selectedSize === size ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20' : 'bg-white/5 text-slate-500 hover:text-white'}`}
                >
                  {size}
                </button>
              ))}
            </div>
          </header>

          <div 
            onClick={() => lineartInputRef.current?.click()}
            className="flex-1 bg-white rounded-3xl border border-white/10 flex items-center justify-center relative overflow-hidden group shadow-[inset_0_2px_10px_rgba(0,0,0,0.05)] cursor-pointer"
          >
            {lineartImage ? (
              <img src={lineartImage} className="max-w-full max-h-full object-contain p-8 transition-transform duration-1000 group-hover:scale-105" alt="CAD Input" />
            ) : (
              <div className="text-center text-slate-400">
                <div className="text-4xl mb-3 opacity-20">⌬</div>
                <p className="text-[9px] font-black uppercase tracking-[0.2em]">上传 黑白 CAD 线稿</p>
              </div>
            )}
            <input ref={lineartInputRef} type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, 'lineart')} />
          </div>

          <div className="mt-8 space-y-6">
            <div className="px-2">
              <div className="flex justify-between items-center mb-3">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">迁移强度 / Strength</label>
                <span className="text-[10px] font-mono text-emerald-500 font-bold">{styleStrength}％</span>
              </div>
              <input 
                type="range" min="0" max="100" value={styleStrength} 
                onChange={(e) => setStyleStrength(parseInt(e.target.value))}
                className="w-full h-1 bg-white/5 rounded-full appearance-none accent-emerald-500 cursor-pointer"
              />
            </div>

            <button 
              onClick={renderLayout}
              disabled={status !== 'idle' || !lineartImage || !styleDesc}
              className="w-full py-5 bg-white hover:bg-emerald-400 text-black text-[12px] font-black uppercase tracking-[0.5em] rounded-3xl transition-all shadow-xl shadow-white/5 active:scale-95 disabled:opacity-5 disabled:grayscale"
            >
              {status === 'rendering' ? '引擎运算中...' : '生成彩色布局图'}
            </button>
          </div>
        </section>

        {/* Step 3: Result */}
        <section className="bg-[#16161a] rounded-[2rem] border border-white/5 p-8 flex flex-col shadow-2xl relative overflow-hidden">
          <header className="flex justify-between items-center mb-6 relative z-10">
            <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-purple-500">03. 渲染结果 / Output</h2>
            {resultImage && (
              <a 
                href={resultImage} 
                download={`CAD_Render_${selectedSize}.png`} 
                className="px-4 py-2 bg-purple-600 rounded-xl text-[9px] font-black uppercase text-white hover:bg-purple-500 transition-all shadow-lg shadow-purple-600/20"
              >
                下载超清图
              </a>
            )}
          </header>

          <div className="flex-1 bg-black/60 rounded-3xl border border-white/5 flex items-center justify-center relative overflow-hidden shadow-inner">
            {status === 'rendering' && (
              <div className="absolute inset-0 z-20 bg-black/95 flex flex-col items-center justify-center backdrop-blur-2xl">
                <div className="relative w-40 h-40 flex items-center justify-center">
                  <div className="absolute inset-0 border-[1px] border-white/5 rounded-full animate-ping"></div>
                  <div className="absolute inset-4 border-[1px] border-purple-500/20 rounded-full animate-pulse"></div>
                  <div className="text-[10px] font-black uppercase tracking-[0.5em] text-white">Rendering</div>
                </div>
                <p className="mt-8 text-slate-500 text-[9px] uppercase tracking-widest font-medium">线稿像素锁定中 · 物理材质计算中</p>
              </div>
            )}
            {resultImage ? (
              <img src={resultImage} className="max-w-full max-h-full object-contain p-2 animate-in fade-in duration-1000" alt="Final Result" />
            ) : (
              <div className="text-center opacity-10 select-none">
                <p className="text-[12px] font-black uppercase tracking-[1em]">Awaiting</p>
              </div>
            )}
          </div>
          <div className="absolute top-0 right-0 w-32 h-32 bg-purple-600/5 blur-[80px] rounded-full"></div>
        </section>
      </main>

      <footer className="px-10 py-6 flex justify-between items-center text-[8px] font-bold text-slate-700 uppercase tracking-[0.3em]">
        <div className="flex gap-12">
          <span className="flex items-center gap-2 italic">Architecture Visual Studio v5.4</span>
          <span className="flex items-center gap-2"><div className="w-1 h-1 bg-emerald-500 rounded-full"></div>Topology Consistency: 100%</span>
        </div>
        <div>All Systems Nominal · Processing on Gemini Vision Engine</div>
      </footer>

      <style>{`
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none; height: 14px; width: 14px; border-radius: 50%; background: #10b981; border: 3px solid #16161a; cursor: pointer;
        }
        @keyframes fade-in { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }
        @keyframes zoom-in { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        .animate-in { animation: zoom-in 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
      `}</style>
    </div>
  );
};

export default App;
