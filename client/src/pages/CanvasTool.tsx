import React, { useState, useEffect } from 'react';
import { KonvaRenderer } from '../components/canvas/KonvaRenderer';
import { DOMRenderer } from '../components/canvas/DOMRenderer';
import { CommandBar } from '../components/canvas/CommandBar';
import { generateLayout } from '../lib/gemini';
import { ApiKeyModal } from '../components/modals/ApiKeyModal';
import { CanvasElement } from '../lib/ai-parser';
import { Layers, Monitor, Code, Sparkles, BrainCircuit, FileJson, FileCode } from 'lucide-react';
import { CodeExporter } from '../components/canvas/CodeExporter';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';

export default function CanvasTool() {
  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<'canvas' | 'dom' | 'json' | 'code'>('dom');
  const [isProcessing, setIsProcessing] = useState(false);
  // Priority: Local Storage -> Env Var -> Empty
  const [apiKey, setApiKey] = useState(() => {
    return localStorage.getItem('gemini_api_key') || import.meta.env.VITE_GEMINI_API_KEY || '';
  });
  const [jsonInput, setJsonInput] = useState('');

  const CANVAS_WIDTH = 800;
  const CANVAS_HEIGHT = 600;

  // Sync JSON editor when elements change (unless we are editing)
  useEffect(() => {
    if (mode !== 'json') {
      setJsonInput(JSON.stringify(elements, null, 2));
    }
  }, [elements, mode]);

  const handleJsonUpdate = () => {
    try {
      const parsed = JSON.parse(jsonInput);
      setElements(parsed);
      toast.success("Updated from JSON");
    } catch (e) {
      toast.error("Invalid JSON");
    }
  };

  const handleApiKeySave = (key: string) => {
    setApiKey(key);
    localStorage.setItem('gemini_api_key', key);
    toast.success("API Key saved!");
  };

  const handleCommand = async (prompt: string) => {
    if (!apiKey) {
      toast.error("Please add your Gemini API Key first (Settings icon)");
      return;
    }

    setIsProcessing(true);
    try {
      const newElements = await generateLayout(apiKey, prompt, elements);
      setElements(newElements);
      toast.success("AI updated the layout");
    } catch (error) {
      console.error(error);
      toast.error("AI Generation failed.");
    } finally {
      setIsProcessing(false);
    }
  };

  const suggestions = [
    "Create a clean landing page header",
    "Add a hero section with centered text",
    "Make a 3-column feature grid",
    "Draw a red circle in the absolute center",
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col font-sans selection:bg-violet-500/30">
      <header className="h-14 border-b border-white/10 flex items-center justify-between px-6 bg-[#0a0a0a]/50 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold tracking-tight">AI Layout <span className="text-white/40 font-normal">Engine</span></span>
        </div>

        <div className="flex items-center gap-1 bg-white/5 p-1 rounded-lg border border-white/10">
          <button onClick={() => setMode('dom')} className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${mode === 'dom' ? 'bg-white/10 text-white shadow-sm' : 'text-white/50 hover:text-white hover:bg-white/5'}`}>
            <Monitor className="w-4 h-4" /> HTML
          </button>
          <button onClick={() => setMode('canvas')} className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${mode === 'canvas' ? 'bg-white/10 text-white shadow-sm' : 'text-white/50 hover:text-white hover:bg-white/5'}`}>
            <Layers className="w-4 h-4" /> Canvas
          </button>
          <button onClick={() => setMode('json')} className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${mode === 'json' ? 'bg-white/10 text-white shadow-sm' : 'text-white/50 hover:text-white hover:bg-white/5'}`}>
            <FileJson className="w-4 h-4" /> JSON
          </button>
          <button onClick={() => setMode('code')} className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${mode === 'code' ? 'bg-white/10 text-white shadow-sm' : 'text-white/50 hover:text-white hover:bg-white/5'}`}>
            <FileCode className="w-4 h-4" /> Code
          </button>
        </div>

        <div className="flex items-center gap-4">
             <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-medium">
                {apiKey ? (
                    <>
                        <BrainCircuit className="w-3 h-3 text-green-400" />
                        <span className="text-green-400">AI Active</span>
                    </>
                ) : (
                    <>
                        <div className="w-2 h-2 rounded-full bg-yellow-500/50"></div>
                        <span className="text-white/40">Setup Key</span>
                    </>
                )}
            </div>
            <ApiKeyModal apiKey={apiKey} onSave={handleApiKeySave} />
        </div>
      </header>

      <main className="flex-1 overflow-hidden relative flex flex-col items-center justify-center p-8 bg-grid-pattern">
        
        {/* Render Area */}
        <div className="relative group shadow-2xl">
            {mode === 'json' ? (
              <div className="w-[800px] h-[600px] bg-[#1e1e1e] rounded-lg border border-white/10 flex flex-col">
                <div className="p-3 border-b border-white/10 text-xs text-white/50 flex justify-between items-center">
                  <span>Editable State JSON</span>
                  <button onClick={handleJsonUpdate} className="text-violet-400 hover:text-violet-300">Apply Changes</button>
                </div>
                <textarea 
                  value={jsonInput}
                  onChange={(e) => setJsonInput(e.target.value)}
                  className="flex-1 bg-transparent p-4 font-mono text-sm text-green-400 resize-none outline-none"
                  spellCheck={false}
                />
              </div>
            ) : mode === 'code' ? (
              <div className="w-[800px] h-[600px]">
                <CodeExporter elements={elements} />
              </div>
            ) : (
              <>
                 <div className="absolute -inset-1 bg-gradient-to-r from-violet-500/20 to-fuchsia-500/20 rounded-xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-1000"></div>
                 {mode === 'canvas' ? (
                  <KonvaRenderer 
                      width={CANVAS_WIDTH} 
                      height={CANVAS_HEIGHT} 
                      elements={elements}
                      onSelect={setSelectedId}
                      selectedId={selectedId}
                      onChange={setElements}
                  />
                  ) : (
                  <DOMRenderer 
                      width={CANVAS_WIDTH} 
                      height={CANVAS_HEIGHT} 
                      elements={elements}
                      onSelect={setSelectedId}
                      selectedId={selectedId}
                  />
                  )}
              </>
            )}
        </div>

        {/* Suggestions */}
        {elements.length === 0 && (
          <div className="mt-8 grid grid-cols-2 gap-2 max-w-lg w-full">
            {suggestions.map((s, i) => (
              <button 
                key={i}
                onClick={() => handleCommand(s)}
                className="text-left text-xs text-white/40 hover:text-violet-400 hover:bg-white/5 p-2 rounded transition-colors border border-transparent hover:border-white/10"
              >
                "{s}"
              </button>
            ))}
          </div>
        )}

        <CommandBar onSubmit={handleCommand} isLoading={isProcessing} />
      </main>
      <Toaster theme="dark" position="bottom-right" />
    </div>
  );
}
