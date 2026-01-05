
import React, { useState, useRef, useEffect } from 'react';
import { CLOSED_LOOP_SCRIPT } from './constants';
import { ScriptElement, Screenplay } from './types';
import { GoogleGenAI } from "@google/genai";

declare const pdfjsLib: any;
declare const mammoth: any;

interface EditableElementProps {
  element: ScriptElement;
  onUpdate: (id: string, newContent: string) => void;
}

const EditableScriptElement: React.FC<EditableElementProps> = ({ element, onUpdate }) => {
  const baseStyle = "mb-4 screenplay-font leading-relaxed whitespace-pre-wrap transition-all cursor-text hover:bg-zinc-500/5 px-2 py-1 rounded";
  
  const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
    onUpdate(element.id, e.currentTarget.innerText);
  };

  switch (element.type) {
    case 'TITLE_PAGE':
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center mb-20">
          <h1 className="text-4xl font-bold tracking-widest uppercase mb-4 screenplay-font">剧本标题</h1>
          <div 
            contentEditable 
            suppressContentEditableWarning
            onBlur={handleInput}
            className="text-xl italic opacity-80 whitespace-pre-line border-t border-b border-zinc-500 py-4 mt-4 min-w-[200px]"
          >
            {element.content}
          </div>
        </div>
      );
    case 'SLUGLINE':
      return <div contentEditable suppressContentEditableWarning onBlur={handleInput} className={`${baseStyle} font-bold uppercase mt-12 mb-6 text-xl tracking-tight border-b-2 border-zinc-700 pb-2`}>{element.content}</div>;
    case 'ACTION':
      return <div contentEditable suppressContentEditableWarning onBlur={handleInput} className={`${baseStyle} text-left text-[1.1rem]`}>{element.content}</div>;
    case 'SHOT':
      return <div contentEditable suppressContentEditableWarning onBlur={handleInput} className={`${baseStyle} font-bold text-left underline mt-6 mb-2 text-zinc-400`}>{element.content}</div>;
    case 'NOTE':
      return (
        <div className="relative group">
          <div contentEditable suppressContentEditableWarning onBlur={handleInput} className={`${baseStyle} text-left italic text-sm p-4 bg-blue-900/10 border-l-4 border-blue-500 my-4 text-blue-200/80`}>
            <span className="font-bold mr-2 text-blue-400 no-print">NOTE:</span>
            {element.content}
          </div>
        </div>
      );
    case 'CHARACTER':
      return <div contentEditable suppressContentEditableWarning onBlur={handleInput} className={`${baseStyle} text-center w-full font-bold uppercase mt-10 mb-1 tracking-[0.2em] text-blue-400`}>{element.content}</div>;
    case 'DIALOGUE':
      return <div contentEditable suppressContentEditableWarning onBlur={handleInput} className={`${baseStyle} text-center w-[75%] mx-auto mb-8 text-[1.1rem] leading-snug`}>{element.content}</div>;
    case 'PARENTHETICAL':
      return <div contentEditable suppressContentEditableWarning onBlur={handleInput} className={`${baseStyle} text-center w-[50%] mx-auto italic text-sm -mt-2 opacity-60`}>({element.content})</div>;
    case 'TRANSITION':
      return <div contentEditable suppressContentEditableWarning onBlur={handleInput} className={`${baseStyle} text-right font-bold uppercase my-12 tracking-widest border-t border-zinc-800 pt-4`}>{element.content}</div>;
    default:
      return null;
  }
};

const App: React.FC = () => {
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [currentScript, setCurrentScript] = useState<Screenplay>(CLOSED_LOOP_SCRIPT);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [showExportMenu, setShowExportMenu] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scriptContentRef = useRef<HTMLDivElement>(null);

  const updateElementContent = (id: string, newContent: string) => {
    setCurrentScript(prev => ({
      ...prev,
      elements: prev.elements.map(el => el.id === id ? { ...el, content: newContent } : el)
    }));
  };

  const extractTextFromFile = async (file: File): Promise<string> => {
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (extension === 'pdf') {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        fullText += textContent.items.map((item: any) => item.str).join(' ') + "\n";
      }
      return fullText;
    } else if (extension === 'docx' || extension === 'doc') {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      return result.value;
    }
    throw new Error("不支持的文件格式");
  };

  const processWithAI = async (rawText: string) => {
    setLoadingMsg("正在利用 Gemini 进行时空结构化解析...");
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-pro-preview",
        contents: `你是一位专业的好莱坞剧本格式化专家。请将以下原始文本转换成结构化的剧本 JSON。原始文本：${rawText.substring(0, 10000)}。必须保持中文原文。`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "ARRAY" as any,
            items: {
              type: "OBJECT" as any,
              properties: {
                id: { type: "STRING" as any },
                type: { type: "STRING" as any, enum: ["SLUGLINE", "ACTION", "CHARACTER", "DIALOGUE", "PARENTHETICAL", "TRANSITION", "SHOT", "NOTE"] },
                content: { type: "STRING" as any }
              },
              required: ["id", "type", "content"]
            }
          }
        }
      });
      const parsedElements = JSON.parse(response.text || "[]");
      if (parsedElements.length > 0) {
        setCurrentScript(prev => ({ ...prev, elements: parsedElements }));
      }
    } catch (error) {
      console.error("AI 解析失败:", error);
      alert("AI 解析剧本失败。");
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsLoading(true);
    setLoadingMsg("正在读取原始文档内容...");
    try {
      const text = await extractTextFromFile(file);
      await processWithAI(text);
    } catch (err) {
      alert("文件读取失败: " + err);
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleExportFDX = () => {
    const elements = currentScript.elements.map(el => {
      let type = "Action";
      switch (el.type) {
        case 'SLUGLINE': type = "Scene Heading"; break;
        case 'CHARACTER': type = "Character"; break;
        case 'DIALOGUE': type = "Dialogue"; break;
        case 'PARENTHETICAL': type = "Parenthetical"; break;
        case 'TRANSITION': type = "Transition"; break;
        case 'SHOT': type = "Shot"; break;
        case 'NOTE': type = "Action"; break;
      }
      return `<Paragraph Type="${type}"><Text>${el.type === 'NOTE' ? `[[ NOTE: ${el.content} ]]` : el.content}</Text></Paragraph>`;
    }).join('');
    const fdx = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?><FinalDraft DocumentType="Script" Version="4"><Content>${elements}</Content></FinalDraft>`;
    downloadFile(fdx, `${currentScript.title}.fdx`, 'application/xml');
  };

  const handleExportPDF = () => {
    window.print();
  };

  const handleExportWord = () => {
    if (!scriptContentRef.current) return;
    const content = scriptContentRef.current.innerHTML;
    const header = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head><meta charset='utf-8'><style>
        body { font-family: 'Courier New', Courier, monospace; }
        .screenplay-font { font-family: 'Courier New', Courier, monospace; }
        .mb-4 { margin-bottom: 1em; }
        .text-center { text-align: center; }
        .text-right { text-align: right; }
        .font-bold { font-weight: bold; }
        .uppercase { text-transform: uppercase; }
      </style></head><body>
    `;
    const footer = "</body></html>";
    const fullHtml = header + content + footer;
    downloadFile(fullHtml, `${currentScript.title}.doc`, 'application/msword');
  };

  const downloadFile = (content: string, fileName: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`min-h-screen transition-colors duration-300 ${isDarkMode ? 'bg-zinc-950 text-zinc-200' : 'bg-zinc-50 text-zinc-900'}`}>
      {/* Loading Overlay */}
      {isLoading && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center backdrop-blur-sm">
          <div className="w-24 h-24 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-8"></div>
          <p className="text-xl font-bold tracking-widest text-blue-400 uppercase loading-flicker screenplay-font">{loadingMsg}</p>
        </div>
      )}

      {/* Header */}
      <header className={`fixed top-0 left-0 right-0 z-50 backdrop-blur-xl border-b p-4 flex justify-between items-center px-8 transition-colors no-print ${isDarkMode ? 'bg-zinc-950/80 border-zinc-800' : 'bg-white/80 border-zinc-200 shadow-sm'}`}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-700 rounded-xl flex items-center justify-center font-bold text-white shadow-lg">C</div>
          <div>
            <h1 className="font-bold tracking-tight text-lg leading-none">{currentScript.title}</h1>
            <p className="text-[10px] uppercase tracking-widest text-zinc-500 mt-1 font-bold">Standard Hollywood Editor</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <input type="file" ref={fileInputRef} onChange={handleImport} accept=".pdf,.doc,.docx" className="hidden" />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all border ${isDarkMode ? 'bg-zinc-900 border-zinc-700 hover:bg-zinc-800' : 'bg-zinc-100 border-zinc-200 hover:bg-zinc-200'}`}
          >
            导入
          </button>
          
          <div className="h-6 w-[1px] bg-zinc-700 mx-1"></div>
          
          <div className="relative">
            <button 
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded-xl text-sm font-semibold transition-all shadow-lg shadow-blue-600/20"
            >
              导出剧本 <span className={`transition-transform duration-200 ${showExportMenu ? 'rotate-180' : ''}`}>▾</span>
            </button>
            
            {showExportMenu && (
              <div className={`absolute right-0 mt-2 w-48 rounded-xl border p-2 shadow-2xl z-50 backdrop-blur-xl ${isDarkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'}`}>
                <button onClick={() => { handleExportFDX(); setShowExportMenu(false); }} className={`w-full text-left px-4 py-2 rounded-lg text-sm transition-colors ${isDarkMode ? 'hover:bg-zinc-800' : 'hover:bg-zinc-100'}`}>导出 .FDX (专业)</button>
                <button onClick={() => { handleExportPDF(); setShowExportMenu(false); }} className={`w-full text-left px-4 py-2 rounded-lg text-sm transition-colors ${isDarkMode ? 'hover:bg-zinc-800' : 'hover:bg-zinc-100'}`}>导出 .PDF (打印)</button>
                <button onClick={() => { handleExportWord(); setShowExportMenu(false); }} className={`w-full text-left px-4 py-2 rounded-lg text-sm transition-colors ${isDarkMode ? 'hover:bg-zinc-800' : 'hover:bg-zinc-100'}`}>导出 .DOC (Word)</button>
              </div>
            )}
          </div>
          
          <button onClick={() => setIsDarkMode(!isDarkMode)} className={`p-2 rounded-xl transition-all ${isDarkMode ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-600'}`}>
            {isDarkMode ? '🌙' : '☀️'}
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="pt-28 pb-32 px-4">
        <div className="max-w-4xl mx-auto screenplay-container">
          <div 
            ref={scriptContentRef}
            className={`page-shadow min-h-[1200px] w-full p-12 md:p-24 rounded-lg transition-all border ${isDarkMode ? 'bg-zinc-900 border-zinc-800 shadow-[0_0_50px_-12px_rgba(0,0,0,0.8)]' : 'bg-white border-zinc-200 shadow-2xl'} relative`}
          >
            {/* Header Watermark */}
            <div className="absolute top-8 left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-[0.5em] font-bold opacity-20 select-none no-print">
              EDITOR MODE: DIRECT EDITING ENABLED
            </div>

            <div className="relative z-10 max-w-2xl mx-auto">
              {currentScript.elements.map((el) => (
                <EditableScriptElement key={el.id} element={el} onUpdate={updateElementContent} />
              ))}
            </div>

            {/* Print Only Footer */}
            <div className="mt-20 pt-8 border-t border-zinc-800/50 flex justify-between items-center text-[10px] font-bold text-zinc-600 tracking-tighter">
              <span>FORMAT: HOLLYWOOD STANDARD</span>
              <span className="text-blue-500/50 uppercase">Formatted via AI Studio Engine</span>
              <span>© 2024 SCRIPT LAB</span>
            </div>
          </div>
        </div>
      </main>

      {/* Action Hints */}
      <div className="fixed bottom-8 right-8 flex flex-col items-end gap-2 no-print">
        <div className="bg-zinc-900/80 backdrop-blur border border-zinc-700 text-zinc-400 px-4 py-2 rounded-lg text-[10px] font-bold tracking-widest uppercase">
          提示：点击文字即可直接编辑
        </div>
        <div className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-[10px] font-bold tracking-widest uppercase shadow-lg shadow-emerald-900/20">
          状态：实时同步中
        </div>
      </div>
    </div>
  );
};

export default App;
