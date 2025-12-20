import React, { useState, useEffect } from 'react';
import { ImageTemplateEditor } from '../components/ImageTemplateEditor';
import { CommandBar } from '../components/canvas/CommandBar';
import { TemplateElement } from '../types/templates'; // Updated import
import { normalizeAiOutput } from '../lib/template-ai';
import AIService from '../lib/ai-service';
import { getAIConfig } from '../lib/ai-config';
import { Layers, Monitor, Code, Sparkles, BrainCircuit, FileJson, FileCode } from 'lucide-react';
import { CodeExporter } from '../components/canvas/CodeExporter';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';

export default function CanvasTool() {
  const [elements, setElements] = useState<TemplateElement[]>([]);
  const [mode, setMode] = useState<'canvas' | 'json' | 'code'>('canvas'); // Removed 'dom' mode as new editor is canvas-first
  const [isProcessing, setIsProcessing] = useState(false);
  // Priority: Local Storage -> Env Var -> Empty
  const [apiKey, setApiKey] = useState(() => {
    return localStorage.getItem('gemini_api_key') || import.meta.env.VITE_GEMINI_API_KEY || '';
  });
  const [jsonInput, setJsonInput] = useState('');

  // Canvas size comes from the editor (defaults to 16:9 preset).
  const [canvasSize, setCanvasSize] = useState({ width: 1280, height: 720 });

  // AI generation strategy toggle (persisted).
  const [aiSchemaMode, setAiSchemaMode] = useState(() => {
    return localStorage.getItem('ai_schema_mode') === '1';
  });

  useEffect(() => {
    localStorage.setItem('ai_schema_mode', aiSchemaMode ? '1' : '0');
  }, [aiSchemaMode]);

  // Sync JSON editor when elements change (unless we are editing)
  useEffect(() => {
    if (mode !== 'json') {
      setJsonInput(JSON.stringify(elements, null, 2));
    }
  }, [elements, mode]);

  const handleJsonUpdate = () => {
    try {
      const parsed = JSON.parse(jsonInput);
      const normalized = normalizeAiOutput(parsed, canvasSize.width, canvasSize.height);
      setElements(normalized);
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
    const config = getAIConfig();

    setIsProcessing(true);
    try {
      const aiService = new AIService(config);
      const newElements = await aiService.generateLayout(
        prompt,
        elements,
        canvasSize.width,
        canvasSize.height,
        { strategy: aiSchemaMode ? 'schema' : 'full' }
      );
      setElements(newElements);
      toast.success(`AI (${config.provider}) updated the layout`);
    } catch (error: any) {
      console.error("Full AI Error:", error);
      const msg = error?.message || "AI Generation failed";
      console.log("Error message for matching:", msg);
      if (msg.includes("404")) {
        toast.error("Model not found (404). Check provider settings.");
      } else if (msg.includes("PERMISSION_DENIED") || msg.includes("403")) {
        toast.error("API Key invalid or permission denied. Check Settings ⚙️");
      } else if (msg.includes("UNAUTHENTICATED")) {
        toast.error("Invalid API key. Check Settings ⚙️");
      } else if (msg.includes("ECONNREFUSED")) {
        toast.error("Cannot connect to Ollama. Is it running?");
      } else {
        toast.error(`AI Error: ${msg.slice(0, 80)}...`);
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
                    <CodeExporter elements={elements} />
                 </div>
              </div>
            ) : (
              <div className="w-full h-full">
                  <ImageTemplateEditor 
                      elements={elements}
                      onChange={setElements}
                      onCanvasSizeChange={setCanvasSize}
                      aiSchemaMode={aiSchemaMode}
                      onAiSchemaModeChange={setAiSchemaMode}
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
