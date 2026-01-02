import React, { useState, useEffect, useRef } from 'react';
import { ImageTemplateEditor } from '../components/ImageTemplateEditor';
import { CommandBar } from '../components/canvas/CommandBar';
import { TemplateElement } from '../types/templates'; // Updated import
import { normalizeAiOutput } from '../lib/template-ai';
import AIService from '../lib/ai-service';
import { getAIConfig, setStoredProviderKey, getStoredProviderKey, aiConfigEvents } from '../lib/ai-config';
import { elementsToHtml, htmlToElements, ensureHtmlHasElementIds } from '../lib/layout-html';
import { Layers, Sparkles, BrainCircuit, FileJson, FileCode, Save, FolderOpen, Image as ImageIcon, Undo, Redo, Settings } from 'lucide-react';
import { CodeExporter } from '../components/canvas/CodeExporter';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import html2canvas from 'html2canvas';
import AIModelSelector from '../components/AIModelSelector';
import ClaudeChatBox from '../components/ClaudeChatBox';

const LAYOUTS_STORAGE_KEY = 'ai-layout-engine.layouts.v1';

type SavedLayout = {
  id: string;
  name: string;
  savedAt: string;
  canvasSize: { width: number; height: number };
  html: string;
};

export default function CanvasTool() {
  const [mode, setMode] = useState<'canvas' | 'json' | 'code' | 'html'>('canvas'); // Added 'html' mode for direct HTML editing
  const [isProcessing, setIsProcessing] = useState(false);
  // Priority: Local Storage -> Env Var -> Empty
  const [jsonInput, setJsonInput] = useState('');

  // Claude chat box visibility
  const [isClaudeChatVisible, setIsClaudeChatVisible] = useState(false);
  const [initialClaudePrompt, setInitialClaudePrompt] = useState<string | undefined>(undefined);

  // Version counter to force re-render when AI config / keys change elsewhere
  const [aiConfigVersion, setAiConfigVersion] = useState(0);

  // Listen for ai-config changes so the status indicator updates immediately when keys are saved
  React.useEffect(() => {
    const handler = () => setAiConfigVersion((v) => v + 1);
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('ai-config-changed', handler as EventListener);
    }
    try {
      aiConfigEvents.addEventListener('ai-config-changed', handler as EventListener);
    } catch (e) {
      // ignore
    }
    return () => {
      if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
        window.removeEventListener('ai-config-changed', handler as EventListener);
      }
      try {
        aiConfigEvents.removeEventListener('ai-config-changed', handler as EventListener);
      } catch (e) {
        // ignore
      }
    };
  }, []);

  // Canvas size comes from the editor (defaults to 16:9 preset).
  const [canvasSize, setCanvasSize] = useState({ width: 1280, height: 720 });

  // HTML representation of the current layout (absolute positioned elements).
  const [htmlLayout, setHtmlLayout] = useState<string>(() =>
    elementsToHtml([], { width: 1280, height: 720 })
  );

  // Elements are now derived from HTML and canvas size (HTML is canonical).
  const elements = React.useMemo<TemplateElement[]>(
    () => htmlToElements(htmlLayout, canvasSize.width, canvasSize.height),
    [htmlLayout, canvasSize.width, canvasSize.height]
  );

  // DOM ref to the actual rendered white canvas for PNG export.
  const canvasDomRef = useRef<HTMLDivElement | null>(null);

  // Multiple named layouts stored locally.
  const [savedLayouts, setSavedLayouts] = useState<SavedLayout[]>([]);
  const [selectedLayoutId, setSelectedLayoutId] = useState<string>('');

  // Editor-level actions exposed from ImageTemplateEditor (for header buttons).
  const editorActionsRef = useRef<{ undo?: () => void; redo?: () => void }>({});

  // AI generation strategy: 'full' (full JSON), 'schema' (actions JSON), 'html' (absolute HTML divs).
  type AiStrategy = 'full' | 'schema' | 'html';
  const [aiStrategy, setAiStrategy] = useState<AiStrategy>(() => {
    const stored = localStorage.getItem('ai_strategy') as AiStrategy | null;
    return stored === 'schema' || stored === 'html' || stored === 'full' ? stored : 'full';
  });

  // Persist AI mode selection
  useEffect(() => {
    localStorage.setItem('ai_strategy', aiStrategy);
  }, [aiStrategy]);

  // Whenever we enter canvas mode, normalize the HTML so every absolutely
  // positioned element has a stable data-el-id. This ensures pasted HTML
  // (like your example) becomes fully editable without requiring a manual
  // "Apply HTML" first.
  useEffect(() => {
    if (mode !== 'canvas') return;
    setHtmlLayout((prev) => ensureHtmlHasElementIds(prev));
  }, [mode]);

  // On mount, if a Gemini key was saved via the old flow (gemini_api_key),
  // (No legacy API key sync required here - keys are managed via the unified settings dialog.)

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
      const nextHtml = elementsToHtml(normalized, canvasSize);
      setHtmlLayout(nextHtml);
      toast.success("Updated from JSON");
    } catch (e) {
      toast.error("Invalid JSON");
    }
  };

  const handleHtmlUpdate = () => {
    try {
      // Normalize the HTML to ensure every absolute element has a stable data-el-id.
      const normalizedHtml = ensureHtmlHasElementIds(htmlLayout);
      // Validate that the normalized HTML can be parsed into elements.
      htmlToElements(normalizedHtml, canvasSize.width, canvasSize.height);
      setHtmlLayout(normalizedHtml);
      toast.success('Updated from HTML');
    } catch (e) {
      console.error(e);
      toast.error('Invalid HTML');
    }
  };

  // Load saved layouts list from localStorage on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LAYOUTS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { version?: number; layouts?: SavedLayout[] };
      if (parsed && Array.isArray(parsed.layouts)) {
        setSavedLayouts(parsed.layouts);
        if (parsed.layouts.length > 0) {
          setSelectedLayoutId(parsed.layouts[0].id);
        }
      }
    } catch (e) {
      console.error('Failed to read saved layouts', e);
    }
  }, []);

  const persistLayouts = (layouts: SavedLayout[]) => {
    try {
      localStorage.setItem(LAYOUTS_STORAGE_KEY, JSON.stringify({ version: 1, layouts }));
    } catch (e) {
      console.error('Failed to write saved layouts', e);
    }
  };

  const handleSaveLayout = () => {
    try {
      const defaultName = savedLayouts.find(l => l.id === selectedLayoutId)?.name || '';
      const name = window.prompt('Layout name', defaultName || 'My Layout');
      if (!name) return;

      setSavedLayouts(prev => {
        const now = new Date().toISOString();
        const existingIndex = prev.findIndex(l => l.name.toLowerCase() === name.toLowerCase());
        let next: SavedLayout[];
        if (existingIndex >= 0) {
          // Overwrite existing layout with same name.
          next = [...prev];
          next[existingIndex] = {
            ...next[existingIndex],
            savedAt: now,
            canvasSize,
            html: htmlLayout,
          };
        } else {
          const newLayout: SavedLayout = {
            id: crypto.randomUUID(),
            name,
            savedAt: now,
            canvasSize,
            html: htmlLayout,
          };
          next = [newLayout, ...prev];
        }
        persistLayouts(next);
        // Select the just-saved layout.
        const target = next.find(l => l.name.toLowerCase() === name.toLowerCase())!;
        setSelectedLayoutId(target.id);
        toast.success('Layout saved');
        return next;
      });
    } catch (e) {
      console.error(e);
      toast.error('Failed to save layout');
    }
  };

  const handleLoadLayout = () => {
    try {
      if (!selectedLayoutId) {
        toast.error('Select a layout to load');
        return;
      }
      const layout = savedLayouts.find(l => l.id === selectedLayoutId);
      if (!layout) {
        toast.error('Selected layout not found');
        return;
      }
      setCanvasSize(layout.canvasSize);
      setHtmlLayout(layout.html);
      toast.success(`Loaded layout "${layout.name}"`);
    } catch (e) {
      console.error(e);
      toast.error('Failed to load layout');
    }
  };

  const handleExportPng = async () => {
    try {
      // Use a clean offscreen snapshot of the HTML canvas so exports are not
      // affected by zoom/pan transforms or selection handles.
      if (!htmlLayout) {
        toast.error('Nothing to export');
        return;
      }

      const offscreen = document.createElement('div');
      offscreen.style.position = 'fixed';
      offscreen.style.left = '-10000px';
      offscreen.style.top = '0';
      offscreen.style.zIndex = '-1';
      offscreen.style.pointerEvents = 'none';
      document.body.appendChild(offscreen);

      const frame = document.createElement('div');
      frame.style.width = `${canvasSize.width}px`;
      frame.style.height = `${canvasSize.height}px`;
      frame.style.boxSizing = 'content-box';
      frame.style.background = '#ffffff';
      frame.style.overflow = 'hidden';
      frame.className = 'export-canvas-frame';
      frame.innerHTML = htmlLayout;

      offscreen.appendChild(frame);

      const canvas = await html2canvas(frame, {
        useCORS: true,
        backgroundColor: '#ffffff',
        scale: 2,
      });

      document.body.removeChild(offscreen);

      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = 'layout.png';
      link.click();
      toast.success('Exported PNG');
    } catch (e) {
      console.error(e);
      toast.error('Failed to export PNG');
    }
  };

  // Legacy API key save handler removed; use unified settings dialog instead.

  const handleCommand = async (prompt: string, attachedFile?: { dataUrl: string; name: string; type: string } | null) => {
    const config = getAIConfig();

    setIsProcessing(true);
    try {
      const aiService = new AIService(config);
      // If an attachment is present, include it inline at the top of the prompt so the provider receives it.
      const promptToSend = attachedFile
        ? (attachedFile.type.startsWith('image/') ? `![${attachedFile.name}](${attachedFile.dataUrl})\n\n${prompt}` : `[file: ${attachedFile.name}](${attachedFile.dataUrl})\n\n${prompt}`)
        : prompt;

      const newElements = await aiService.generateLayout(
        promptToSend,
        elements,
        canvasSize.width,
        canvasSize.height,
        { strategy: aiStrategy },
         htmlLayout
      );
      console.log("AI generated elements:", newElements);
      
      // If AI returned raw HTML (string) — treat it as canonical HTML layout.
      if (typeof newElements === 'string') {
        try {
          const normalizedHtml = ensureHtmlHasElementIds(newElements);
          // Validate it can be parsed into elements for safety.
          htmlToElements(normalizedHtml, canvasSize.width, canvasSize.height);
          setHtmlLayout(normalizedHtml);
          toast.success('AI returned HTML layout');
          return;
        } catch (e) {
          console.error('Invalid HTML from AI:', e);
          toast.error('AI returned invalid HTML');
          return;
        }
      }


      const nextHtml = elementsToHtml(newElements, canvasSize);
      setHtmlLayout(nextHtml);
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

  const AIStatusIndicator = () => {
    try {
      const cfg = getAIConfig();
      const provider = cfg.provider;
      let active = false;
      if (provider === 'puter') {
        active = localStorage.getItem('puter_enabled') === '1';
      } else if (provider === 'huggingface') {
        active = Boolean(getStoredProviderKey('huggingface', cfg.huggingfaceModel) || cfg.apiKey);
      } else if (provider === 'gemini') {
        active = Boolean(getStoredProviderKey('gemini') || cfg.apiKey || import.meta.env.VITE_GEMINI_API_KEY);
      } else if (provider === 'groq') {
        active = Boolean(getStoredProviderKey('groq') || cfg.groqApiKey);
      } else if (provider === 'claude') {
        active = Boolean(getStoredProviderKey('claude') || cfg.claudeApiKey);
      } else if (provider === 'ollama') {
        // Ollama is local, assume active if URL is set
        active = Boolean(cfg.ollamaUrl);
      }
      return (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-medium">
          {active ? (
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
      );
    } catch (e) {
      return null;
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col font-sans selection:bg-violet-500/30">
      <header className="h-14 border-b border-white/10 flex items-center justify-between px-6 bg-[#0a0a0a]/50 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-linear-to-br from-violet-600 to-indigo-600 flex items-center justify-center">
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
          <button onClick={() => setMode('html')} className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${mode === 'html' ? 'bg-white/10 text-white shadow-sm' : 'text-white/50 hover:text-white hover:bg-white/5'}`}>
            <FileCode className="w-4 h-4" /> HTML
          </button>

          {/* AI strategy selector: full JSON, schema actions, or direct HTML */}
          <label className="ml-2 flex items-center gap-1 text-xs text-white/70 select-none">
            <span>AI Mode</span>
            <select
              value={aiStrategy}
              onChange={(e) => setAiStrategy(e.target.value as AiStrategy)}
              className="ml-1 bg-transparent text-white/80 text-xs border border-white/20 rounded px-1 py-0.5"
              title="AI generation mode"
            >
              <option value="full">JSON (full)</option>
              <option value="schema">JSON (schema)</option>
              <option value="html">HTML (absolute divs)</option>
            </select>
          </label>

          {/* Layout selection + actions */}
          <select
            value={selectedLayoutId}
            onChange={(e) => setSelectedLayoutId(e.target.value)}
            className="ml-2 bg-white/5 text-white/80 text-xs rounded px-2 py-1 border border-white/10 max-w-[180px] overflow-hidden text-ellipsis"
            title="Saved layouts"
          >
            <option value="">Layouts</option>
            {[...savedLayouts]
              .sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || ''))
              .map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
          </select>

          <button
            onClick={handleSaveLayout}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium text-white/70 hover:text-white hover:bg-white/5 transition-all"
          >
            <Save className="w-4 h-4" /> Save
          </button>
          <button
            onClick={handleLoadLayout}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium text-white/70 hover:text-white hover:bg-white/5 transition-all"
          >
            <FolderOpen className="w-4 h-4" /> Load
          </button>
          <button
            onClick={handleExportPng}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium text-white/70 hover:text-white hover:bg-white/5 transition-all"
          >
            <ImageIcon className="w-4 h-4" /> Export PNG
          </button>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => editorActionsRef.current.undo?.()}
              className="w-8 h-8 rounded-md flex items-center justify-center bg-white/5 text-white/70 hover:text-white hover:bg-white/10"
              title="Undo (Ctrl/Cmd+Z)"
            >
              <Undo className="w-3 h-3" />
            </button>
            <button
              onClick={() => editorActionsRef.current.redo?.()}
              className="w-8 h-8 rounded-md flex items-center justify-center bg-white/5 text-white/70 hover:text-white hover:bg-white/10"
              title="Redo (Ctrl/Cmd+Shift+Z)"
            >
              <Redo className="w-3 h-3" />
            </button>
            {/* Unified AI settings */}
              <AIModelSelector />
          </div>

          <AIStatusIndicator />
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
            ) : mode === 'html' ? (
              <div className="w-full h-full p-8 flex gap-4">
                {/* Pure HTML preview on the left */}
                <div className="flex-1 flex items-center justify-center overflow-auto">
                  <div
                    ref={canvasDomRef}
                    className="bg-transparent"
                    style={{ maxWidth: '100%', maxHeight: '100%' }}
                  >
                    <div
                      className="shadow-2xl border border-white/10 bg-white relative overflow-hidden"
                      style={{ width: canvasSize.width, height: canvasSize.height }}
                      // Render the raw HTML exactly as provided (no parsing / re-generation).
                      dangerouslySetInnerHTML={{ __html: htmlLayout }}
                    />
                  </div>
                </div>

                {/* HTML source editor on the right */}
                <div className="w-[420px]  bg-[#1e1e1e] rounded-lg border border-white/10 flex flex-col shadow-2xl">
                  <div className="p-3 border-b border-white/10 text-xs text-white/50 flex justify-between items-center">
                    <span>Editable HTML Layout</span>
                    <button onClick={handleHtmlUpdate} className="text-violet-400 hover:text-violet-300">Apply HTML</button>
                  </div>
                  <textarea
                    value={htmlLayout}
                    onChange={(e) => setHtmlLayout(e.target.value)}
                    className="flex-1 bg-transparent p-4 font-mono text-xs text-blue-300  outline-none"
                    spellCheck={false}
                  />
                </div>
              </div>
            ) : (
              <div className="w-full h-full">
                  <ImageTemplateEditor 
                      elements={elements}
                      htmlLayout={htmlLayout}
                      onHtmlLayoutChange={setHtmlLayout}
                      // In HTML-first mode, the raw HTML is the single source of truth.
                      // All visual edits must go through onHtmlLayoutChange helpers that
                      // patch inline CSS in-place (updateHtmlForTransforms, updateHtmlRawStyle,
                      // updateHtmlTextContent, etc.). Regenerating the layout from the
                      // simplified TemplateElement model would destroy complex AI styles
                      // (gradients, shadows, custom fonts), so we intentionally ignore
                      // onChange here in canvas mode.
                      onChange={(_next) => {
                        // no-op on purpose to preserve original HTML styling.
                      }}
                      onCanvasSizeChange={setCanvasSize}
                      aiSchemaMode={aiStrategy === 'schema'}
                      onAiSchemaModeChange={(next) => setAiStrategy(next ? 'schema' : 'full')}
                      onCanvasElementRefChange={(el) => { canvasDomRef.current = el; }}
                      onRegisterEditorActions={(actions) => { editorActionsRef.current = actions; }}
                      onOpenClaudeChat={(prompt?: string) => {
                        setInitialClaudePrompt(prompt);
                        setIsClaudeChatVisible(true);
                      }}
                  />
              </div>
            )}
        </div>

        {/* Suggestions - Only show when empty and in canvas mode */}
        {elements.length === 0 && mode === 'canvas' && (
          <div className="absolute bottom-25 left-1/2 transform -translate-x-1/2 grid grid-cols-4 gap-2 max-w-[80%] w-full pointer-events-none">
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

      {/* Floating Claude Chat Box */}
      {isClaudeChatVisible && (
        <ClaudeChatBox
          initialPrompt={initialClaudePrompt}
          onClose={() => {
            setIsClaudeChatVisible(false);
            setInitialClaudePrompt(undefined);
          }}
        />
      )}

      <Toaster theme="dark" position="bottom-right" />
    </div>
  );
}
