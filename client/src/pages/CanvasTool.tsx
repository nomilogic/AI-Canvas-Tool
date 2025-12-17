import React, { useState, useEffect } from 'react';
import { ImageTemplateEditor } from '../components/ImageTemplateEditor';
import { CommandBar } from '../components/canvas/CommandBar';
import { generateLayout } from '../lib/gemini';
import { ApiKeyModal } from '../components/modals/ApiKeyModal';
import { TemplateElement } from '../types/templates'; // Updated import
import { Layers, Monitor, Code, Sparkles, BrainCircuit, FileJson, FileCode } from 'lucide-react';
import { CodeExporter } from '../components/canvas/CodeExporter';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';

export default function CanvasTool() {
  const [elements, setElements] = useState<TemplateElement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<'canvas' | 'json' | 'code'>('canvas'); // Removed 'dom' mode as new editor is canvas-first
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
      // Note: generateLayout returns CanvasElement[], we cast/map it to TemplateElement[]
      // For this prototype, assuming the AI returns a structure we can use or we need to map it.
      // Since we changed the editor, the AI might return incompatible types.
      // For now, let's just log or try to set it.
      const newElements: any = await generateLayout(apiKey, prompt, elements as any);
      // Basic mapping if needed, or rely on loose typing for prototype
      setElements(newElements); 
      toast.success("AI updated the layout");
    } catch (error: any) {
      console.error("Full AI Error:", error);
      const msg = error?.message || "AI Generation failed";
      if (msg.includes("404")) {
        toast.error("Model not found (404). Trying a different model...");
      } else if (msg.includes("403") || msg.includes("key")) {
        toast.error("Invalid API Key. Please check settings.");
      } else {
        toast.error(`AI Error: ${msg.slice(0, 50)}...`);
      }
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
          <button onClick={() => setMode('canvas')} className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${mode === 'canvas' ? 'bg-white/10 text-white shadow-sm' : 'text-white/50 hover:text-white hover:bg-white/5'}`}>
            <Layers className="w-4 h-4" /> Editor
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

      <main className="flex-1 overflow-hidden relative flex flex-col items-center justify-center bg-grid-pattern">
        
        {/* Render Area */}
        <div className="w-full h-full relative group">
            {mode === 'json' ? (
              <div className="w-full h-full p-8 flex items-center justify-center">
                <div className="w-[800px] h-[600px] bg-[#1e1e1e] rounded-lg border border-white/10 flex flex-col shadow-2xl">
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
              </div>
            ) : mode === 'code' ? (
              <div className="w-full h-full p-8 flex items-center justify-center">
                 <div className="w-[800px] h-[600px] bg-[#1e1e1e] rounded-lg border border-white/10 shadow-2xl overflow-hidden">
                    <CodeExporter elements={elements as any} />
                 </div>
              </div>
            ) : (
              <div className="w-full h-full">
                  <ImageTemplateEditor 
                      elements={elements}
                      onChange={setElements}
                  />
              </div>
            )}
        </div>

        {/* Suggestions - Only show when empty and in canvas mode */}
        {elements.length === 0 && mode === 'canvas' && (
          <div className="absolute bottom-20 left-1/2 transform -translate-x-1/2 grid grid-cols-2 gap-2 max-w-lg w-full pointer-events-none">
            {suggestions.map((s, i) => (
              <button 
                key={i}
                onClick={() => handleCommand(s)}
                className="pointer-events-auto text-left text-xs text-white/40 hover:text-violet-400 hover:bg-[#1e1e1e] p-2 rounded transition-colors border border-transparent hover:border-white/10 bg-[#0a0a0a]/80 backdrop-blur"
              >
                "{s}"
              </button>
            ))}
          </div>
        )}

        <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 w-full max-w-2xl px-4">
             <CommandBar onSubmit={handleCommand} isLoading={isProcessing} />
        </div>
      </main>
      <Toaster theme="dark" position="bottom-right" />
    </div>
  );
}
