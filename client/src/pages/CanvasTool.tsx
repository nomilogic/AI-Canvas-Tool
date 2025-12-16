import React, { useState, useEffect } from 'react';
import { KonvaRenderer } from '../components/canvas/KonvaRenderer';
import { DOMRenderer } from '../components/canvas/DOMRenderer';
import { CommandBar } from '../components/canvas/CommandBar';
import { parsePromptToElement, CanvasElement } from '../lib/ai-parser';
import { generateLayout } from '../lib/gemini';
import { ApiKeyModal } from '../components/modals/ApiKeyModal';
import { Layers, Monitor, Code, Sparkles, BrainCircuit } from 'lucide-react';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';

export default function CanvasTool() {
  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<'canvas' | 'dom'>('canvas');
  const [isProcessing, setIsProcessing] = useState(false);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('gemini_api_key') || '');

  const CANVAS_WIDTH = 800;
  const CANVAS_HEIGHT = 600;

  const handleApiKeySave = (key: string) => {
    setApiKey(key);
    localStorage.setItem('gemini_api_key', key);
    toast.success("API Key saved!");
  };

  const handleCommand = async (prompt: string) => {
    setIsProcessing(true);
    
    try {
      if (apiKey) {
        // Use Real AI
        try {
          const newElements = await generateLayout(apiKey, prompt, elements);
          // For the real AI, we replace the state because the AI returns the *complete* new state
          setElements(newElements);
          toast.success("AI updated the canvas");
        } catch (error) {
          console.error(error);
          toast.error("AI Generation failed. Check your API Key.");
        }
      } else {
        // Fallback to Heuristic Parser
        toast.info("Using basic parser (No API Key provided)");
        // Simulate delay for feel
        await new Promise(r => setTimeout(r, 600));
        const newElement = parsePromptToElement(prompt, CANVAS_WIDTH, CANVAS_HEIGHT);
        if (newElement) {
          setElements(prev => [...prev, newElement]);
          toast.success("Element created");
        } else {
          toast.error("Could not understand command");
        }
      }
    } catch (e) {
      toast.error("Something went wrong");
    } finally {
      setIsProcessing(false);
    }
  };

  const suggestions = [
    "Create a modern pricing card layout",
    "Draw a mobile app navigation bar",
    "Create a hero section with headline and buttons",
    "Add a notification badge on top right",
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col font-sans selection:bg-violet-500/30">
      <header className="h-14 border-b border-white/10 flex items-center justify-between px-6 bg-[#0a0a0a]/50 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold tracking-tight">AI Canvas <span className="text-white/40 font-normal">Proto</span></span>
        </div>

        <div className="flex items-center gap-1 bg-white/5 p-1 rounded-lg border border-white/10">
          <button
            onClick={() => setMode('canvas')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
              mode === 'canvas' ? 'bg-white/10 text-white shadow-sm' : 'text-white/50 hover:text-white hover:bg-white/5'
            }`}
          >
            <Layers className="w-4 h-4" />
            Canvas (Konva)
          </button>
          <button
            onClick={() => setMode('dom')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
              mode === 'dom' ? 'bg-white/10 text-white shadow-sm' : 'text-white/50 hover:text-white hover:bg-white/5'
            }`}
          >
            <Monitor className="w-4 h-4" />
            DOM (HTML)
          </button>
        </div>

        <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-medium">
                {apiKey ? (
                    <>
                        <BrainCircuit className="w-3 h-3 text-green-400" />
                        <span className="text-green-400">Gemini Active</span>
                    </>
                ) : (
                    <>
                        <div className="w-2 h-2 rounded-full bg-yellow-500/50"></div>
                        <span className="text-white/40">Basic Mode</span>
                    </>
                )}
            </div>
            <ApiKeyModal apiKey={apiKey} onSave={handleApiKeySave} />
        </div>
      </header>

      <main className="flex-1 overflow-hidden relative flex flex-col items-center justify-center p-8 bg-grid-pattern">
        
        {/* Render Area */}
        <div className="relative group">
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

        {/* Floating JSON Preview (Bottom Right) */}
        <div className="absolute top-8 right-8 w-64 bg-black/80 backdrop-blur-md border border-white/10 rounded-lg p-4 font-mono text-xs text-white/70 overflow-hidden shadow-2xl">
          <div className="flex items-center gap-2 text-white/40 mb-2 pb-2 border-b border-white/10">
            <Code className="w-3 h-3" />
            <span>State Preview</span>
          </div>
          <pre className="overflow-auto max-h-60">
            {JSON.stringify(elements, null, 2)}
          </pre>
        </div>

        <CommandBar onSubmit={handleCommand} isLoading={isProcessing} />
      </main>
      <Toaster theme="dark" position="bottom-right" />
    </div>
  );
}
