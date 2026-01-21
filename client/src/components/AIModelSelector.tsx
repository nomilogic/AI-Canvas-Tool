import React, { useState } from "react";
import { Settings, Check, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { AIProvider, AIConfig } from "@/lib/ai-service";
import { getAIConfig, saveAIConfig, getStoredProviderKey, setStoredProviderKey } from "@/lib/ai-config";
import modelRegistry from "@/lib/ai-model-registry.json";
import { toast } from "sonner";

const HF_IMAGE_MODELS = modelRegistry.huggingface?.models || [
  "stabilityai/stable-diffusion-xl-base-1.0",
  "stabilityai/stable-diffusion-2",
  "runwayml/stable-diffusion-v1-5",
  "DeepFloyd/IF",
  "segmind/DreamShaper",
];

const GEMINI_MODELS = modelRegistry.gemini?.models || [
  'gemini-pro-1',
  'gemini-1.5',
  'gemini-1.0-chat',
];

const OPENAI_MODELS = modelRegistry.openai?.models || [
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4',
  'gpt-3.5-turbo',
];

const DEEPSEEK_MODELS = modelRegistry.deepseek?.models || [
  'deepseek-general-v1',
  'deepseek-vision-v1',
];

const CLAUDE_MODELS = modelRegistry.claude?.models || [
  'claude-3-opus',
  'claude-3-large',
  'claude-3-small',
];

const GROQ_MODELS = modelRegistry.groq?.models || [
  "groq/compound",
  "groq/compound-mini",
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "mixtral-8x7b-32768",
  "qwen/qwen3-32b",
];

export const AIModelSelector = () => {
  const [config, setConfig] = useState<AIConfig>(getAIConfig());
  const [open, setOpen] = useState(false);
  const [puterEnabled, setPuterEnabled] = useState<boolean>(() => localStorage.getItem('puter_enabled') === '1');
  const [puterModel, setPuterModel] = useState<string>(() => localStorage.getItem('puter_model') || 'claude-sonnet-4-5');
  const [puterStreaming, setPuterStreaming] = useState<boolean>(() => localStorage.getItem('puter_stream') === '1');
  const [puterStatus, setPuterStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');

  // Keep inputs separate so we don't accidentally persist secrets in ai-config.
  const [providerKeyInput, setProviderKeyInput] = useState<string>("");

  // Sync config with localStorage when dialog opens
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      // When opening, read fresh config from localStorage
      const fresh = getAIConfig();
      setConfig(fresh);
      setPuterEnabled(localStorage.getItem('puter_enabled') === '1');
      setPuterModel(localStorage.getItem('puter_model') || 'claude-sonnet-4-5');
      setPuterStreaming(localStorage.getItem('puter_stream') === '1');

      if (fresh.provider === "gemini") {
        setProviderKeyInput(getStoredProviderKey("gemini") || fresh.apiKey || "");
        // ensure model shows
        (fresh as any).geminiModel = fresh.geminiModel || localStorage.getItem('gemini_model') || (fresh as any).geminiModel;
      } else if (fresh.provider === "claude") {
        setProviderKeyInput(getStoredProviderKey("claude") || fresh.claudeApiKey || "");
      } else if (fresh.provider === 'openai') {
        setProviderKeyInput(getStoredProviderKey('openai') || fresh.openaiApiKey || '');
        (fresh as any).openaiModel = fresh.openaiModel || localStorage.getItem('openai_model') || (fresh as any).openaiModel;
      } else if (fresh.provider === 'deepseek') {
        setProviderKeyInput(getStoredProviderKey('deepseek') || fresh.deepseekApiKey || '');
        (fresh as any).deepseekModel = fresh.deepseekModel || localStorage.getItem('deepseek_model') || (fresh as any).deepseekModel;
      } else if (fresh.provider === "huggingface") {
        setProviderKeyInput(getStoredProviderKey("huggingface", fresh.huggingfaceModel) || fresh.apiKey || "");
      } else if (fresh.provider === "groq") {
        setProviderKeyInput(getStoredProviderKey("groq") || fresh.groqApiKey || "");
      } else {
        setProviderKeyInput("");
      }
    }
    setOpen(newOpen);
  };

  const handleProviderChange = (provider: AIProvider) => {
    const newConfig = { ...config, provider };
    setConfig(newConfig);
    saveAIConfig(newConfig);

    // Load the correct key into the input when switching providers.
    if (provider === "gemini") {
      setProviderKeyInput(getStoredProviderKey("gemini") || "");
    } else if (provider === "claude") {
      setProviderKeyInput(getStoredProviderKey("claude") || "");
    } else if (provider === "huggingface") {
      const model = newConfig.huggingfaceModel;
      setProviderKeyInput(getStoredProviderKey("huggingface", model) || "");
    } else if (provider === "groq") {
      setProviderKeyInput(getStoredProviderKey("groq") || "");
    } else {
      setProviderKeyInput("");
    }
  };

  const handleProviderKeyChange = (key: string) => {
    setProviderKeyInput(key);

    if (config.provider === "gemini") {
      setStoredProviderKey("gemini", key);
    } else if (config.provider === 'openai') {
      setStoredProviderKey('openai', key);
    } else if (config.provider === 'deepseek') {
      setStoredProviderKey('deepseek', key);
    } else if (config.provider === "claude") {
      setStoredProviderKey("claude", key);
    } else if (config.provider === "huggingface") {
      setStoredProviderKey("huggingface", key, config.huggingfaceModel);
    } else if (config.provider === "groq") {
      setStoredProviderKey("groq", key);
    }

    // Refresh effective config (so connection tests use the latest stored key).
    setConfig(getAIConfig());
  };

  const handleOllamaUrlChange = (url: string) => {
    const newConfig = { ...config, ollamaUrl: url };
    setConfig(newConfig);
    saveAIConfig(newConfig);
  };

  const handlePuterTest = async () => {
    if (!puterEnabled) return;
    setPuterStatus('testing');
    try {
      const { default: callPuterChat } = await import('@/lib/puter-client');
      const resp: any = await callPuterChat('Say hi', { model: puterModel, stream: false });
      const text = resp?.message?.content?.[0]?.text ?? '';
      if (text && text.length > 0) {
        setPuterStatus('success');
        toast.success('✓ Puter / Claude connection successful!');
      } else {
        setPuterStatus('error');
        toast.error('✗ Puter returned no text');
      }
    } catch (err: any) {
      console.error('Puter test failed', err);
      setPuterStatus('error');
      toast.error(`✗ Puter test failed: ${err?.message ?? String(err)}`);
    }
  };

  const handleHuggingFaceModelChange = (model: string) => {
    const newConfig = { ...config, huggingfaceModel: model };
    setConfig(newConfig);
    saveAIConfig(newConfig);

    // Load key for that model into the input.
    setProviderKeyInput(getStoredProviderKey("huggingface", model) || "");
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <button className="relative w-10 h-10 rounded-md flex items-center justify-center hover:bg-[#3e3e42] text-gray-400 hover:text-white transition-colors" title="AI Settings">
          <Settings size={20} />
          {/* Small key indicator synced with global AI config */}
          {(() => {
            // Determine whether the currently-selected provider has an active key / is usable
            const cfg = config || getAIConfig();
            const provider = cfg.provider as AIProvider;
            let active = false;
            if (provider === 'puter') {
              active = localStorage.getItem('puter_enabled') === '1';
            } else if (provider === 'huggingface') {
              active = Boolean(getStoredProviderKey('huggingface', cfg.huggingfaceModel) || cfg.apiKey);
            } else if (provider === 'gemini') {
              active = Boolean(getStoredProviderKey('gemini') || cfg.apiKey || (typeof (import.meta as any)?.env !== 'undefined' && (import.meta as any).env.VITE_GEMINI_API_KEY));
            } else if (provider === 'groq') {
              active = Boolean(getStoredProviderKey('groq') || cfg.groqApiKey);
            } else if (provider === 'claude') {
              active = Boolean(getStoredProviderKey('claude') || cfg.claudeApiKey);
            } else if (provider === 'ollama') {
              active = Boolean(cfg.ollamaUrl);
            } else if (provider === 'openai') {
              active = Boolean(getStoredProviderKey('openai') || cfg.openaiApiKey);
            } else if (provider === 'deepseek') {
              // DeepSeek uses server proxy — local key presence indicates client may be configured for serverless usage
              active = Boolean(getStoredProviderKey('deepseek') || cfg.deepseekApiKey);
            }
            return (
              <div className={`absolute -top-1 -right-1 w-3 h-3 rounded-full ${active ? 'bg-green-400' : 'bg-yellow-400/80'} border border-white/10`} />
            );
          })()}
        </button>
      </DialogTrigger>
      <DialogContent className="bg-[#252526] border-[#3e3e42] text-white">
        <DialogHeader>
          <DialogTitle>AI Model Settings</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Provider Selection */}
          <div>
            <label className="text-sm font-semibold text-gray-300 mb-2 block">AI Provider</label>
            <select
              value={config.provider}
              onChange={(e) => handleProviderChange(e.target.value as AIProvider)}
              className="w-full bg-[#3e3e42] border border-[#4e4e52] rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500"
            >
              <option value="gemini">Google Gemini (Free - Requires API Key)</option>
              <option value="ollama">Ollama (Free - Local)</option>
              <option value="huggingface">HuggingFace (Free - Requires API Key)</option>
              <option value="groq">Groq (Free - Requires API Key)</option>
              <option value="openai">OpenAI (Requires API Key)</option>
              <option value="deepseek">DeepSeek (Requires API Key)</option>
              <option value="puter">Puter / Claude (Free - Client-side User-Pays)</option>
              <option value="claude">Anthropic Claude (Server-side - Requires API Key)</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">Switch between different AI models</p>
          </div>

          {/* Gemini API Key */}
          {config.provider === "gemini" && (
            <div>
              <label className="text-sm font-semibold text-gray-300 mb-2 block">Google Gemini API Key</label>
              <input
                type="password"
                value={providerKeyInput}
                onChange={(e) => handleProviderKeyChange(e.target.value)}
                placeholder="AIza..."
                className="w-full bg-[#3e3e42] border border-[#4e4e52] rounded px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
              />
              <div className="mt-3">
                <label className="text-sm font-semibold text-gray-300 mb-2 block">Gemini Model</label>
                <select
                  value={(config as any).geminiModel || GEMINI_MODELS[0]}
                  onChange={(e) => {
                    const nc = { ...config, geminiModel: e.target.value } as AIConfig & any;
                    setConfig(nc);
                    saveAIConfig(nc);
                    localStorage.setItem('gemini_model', e.target.value);
                  }}
                  className="w-full bg-[#3e3e42] border border-[#4e4e52] rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                >
                  {GEMINI_MODELS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">Choose the Gemini model to use for chat/layout generation.</p>
              </div>
              <p className="text-xs text-gray-500 mt-1">Stored as: ai-key:gemini</p>
            </div>
          )}

          {/* OpenAI Model + API Key */}
          {config.provider === 'openai' && (
            <div className="space-y-3">
              <div>
                <label className="text-sm font-semibold text-gray-300 mb-2 block">OpenAI Model</label>
                <select
                  value={(config as any).openaiModel || OPENAI_MODELS[0]}
                  onChange={(e) => {
                    const nc = { ...config, openaiModel: e.target.value } as AIConfig & any;
                    setConfig(nc);
                    saveAIConfig(nc);
                    localStorage.setItem('openai_model', e.target.value);
                  }}
                  className="w-full bg-[#3e3e42] border border-[#4e4e52] rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                >
                  {OPENAI_MODELS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">Stored as: ai-key:openai</p>
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-300 mb-2 block">OpenAI API Key</label>
                <input
                  type="password"
                  value={providerKeyInput}
                  onChange={(e) => handleProviderKeyChange(e.target.value)}
                  placeholder="sk-..."
                  className="w-full bg-[#3e3e42] border border-[#4e4e52] rounded px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          )}

          {/* DeepSeek API Key + Model */}
          {config.provider === 'deepseek' && (
            <div className="space-y-3">
              <div>
                <label className="text-sm font-semibold text-gray-300 mb-2 block">DeepSeek Model</label>
                <select
                  value={(config as any).deepseekModel || DEEPSEEK_MODELS[0]}
                  onChange={(e) => {
                    const nc = { ...config, deepseekModel: e.target.value } as AIConfig & any;
                    setConfig(nc);
                    saveAIConfig(nc);
                    localStorage.setItem('deepseek_model', e.target.value);
                  }}
                  className="w-full bg-[#3e3e42] border border-[#4e4e52] rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                >
                  {DEEPSEEK_MODELS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">Stored as: ai-key:deepseek</p>
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-300 mb-2 block">DeepSeek API Key</label>
                <input
                  type="password"
                  value={providerKeyInput}
                  onChange={(e) => handleProviderKeyChange(e.target.value)}
                  placeholder="ds_..."
                  className="w-full bg-[#3e3e42] border border-[#4e4e52] rounded px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          )}

          {/* HuggingFace Model + API Key */}
          {config.provider === "huggingface" && (
            <div className="space-y-3">
              <div>
                <label className="text-sm font-semibold text-gray-300 mb-2 block">HuggingFace Model (image)</label>
                <select
                  value={config.huggingfaceModel || ""}
                  onChange={(e) => handleHuggingFaceModelChange(e.target.value)}
                  className="w-full bg-[#3e3e42] border border-[#4e4e52] rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                >
                  {HF_IMAGE_MODELS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">Keys are stored per model.</p>
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-300 mb-2 block">HuggingFace API Key</label>
                <input
                  type="password"
                  value={providerKeyInput}
                  onChange={(e) => handleProviderKeyChange(e.target.value)}
                  placeholder="hf_..."
                  className="w-full bg-[#3e3e42] border border-[#4e4e52] rounded px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">Stored as: ai-key:huggingface:{config.huggingfaceModel}</p>
              </div>
            </div>
          )}

          {/* Groq API Key */}
          {config.provider === "groq" && (
            <div className="space-y-3">
              <div>
                <label className="text-sm font-semibold text-gray-300 mb-2 block">Groq Model</label>
                <select
                  value={(config as any).groqModel || localStorage.getItem('groq_model') || GROQ_MODELS[0]}
                  onChange={(e) => {
                    const nc = { ...config, groqModel: e.target.value } as AIConfig & any;
                    setConfig(nc);
                    saveAIConfig(nc);
                    localStorage.setItem('groq_model', e.target.value);
                  }}
                  className="w-full bg-[#3e3e42] border border-[#4e4e52] rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                >
                  {GROQ_MODELS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">Stored as: ai-key:groq</p>
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-300 mb-2 block">Groq API Key</label>
                <input
                  type="password"
                  value={providerKeyInput}
                  onChange={(e) => handleProviderKeyChange(e.target.value)}
                  placeholder="gsk_..."
                  className="w-full bg-[#3e3e42] border border-[#4e4e52] rounded px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          )}

          {/* Claude API Key + Model */}
          {config.provider === "claude" && (
            <div className="space-y-3">
              <div>
                <label className="text-sm font-semibold text-gray-300 mb-2 block">Claude Model</label>
                <select
                  value={(localStorage.getItem('claude_model') as string) || 'claude-3-opus'}
                  onChange={(e) => {
                    localStorage.setItem('claude_model', e.target.value);
                    const nc = { ...config } as any;
                    setConfig(nc);
                    saveAIConfig(nc);
                  }}
                  className="w-full bg-[#3e3e42] border border-[#4e4e52] rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                >
                  {CLAUDE_MODELS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">Stored as: ai-key:claude</p>
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-300 mb-2 block">Claude API Key</label>
                <input
                  type="password"
                  value={providerKeyInput}
                  onChange={(e) => handleProviderKeyChange(e.target.value)}
                  placeholder="sk-cl..."
                  className="w-full bg-[#3e3e42] border border-[#4e4e52] rounded px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          )}

          {/* Puter client-side options (was in ApiKeyModal) */}
          {config.provider === 'puter' && (
            <div className="grid w-full items-center gap-1.5 pt-2 border-t border-white/6">
              <label className="text-sm font-semibold text-gray-300">Puter / Claude (client-side)</label>
              <div className="flex items-center gap-3">
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={puterEnabled} onChange={(e) => setPuterEnabled(e.target.checked)} className="h-4 w-4" />
                  <span className="text-xs">Enable Puter (Claude Sonnet via CDN / client)</span>
                </label>
                <button onClick={handlePuterTest} disabled={!puterEnabled || puterStatus === 'testing'} className={`px-2 py-1 rounded text-xs ${puterStatus === 'success' ? 'bg-green-600 text-white' : 'bg-white/5 text-white/70 hover:bg-white/10'}`}>
                  {puterStatus === 'testing' ? 'Testing...' : 'Test'}
                </button>
              </div>

              {puterEnabled && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-xs text-gray-500 block mb-1">Model</span>
                    <select value={puterModel} onChange={(e) => setPuterModel(e.target.value)} className="w-full bg-[#3e3e42] rounded px-2 py-1 text-sm">
                      <option value="claude-sonnet-4-5">claude-sonnet-4-5</option>
                      <option value="claude-opus-4-5">claude-opus-4-5</option>
                      <option value="claude-haiku-4-5">claude-haiku-4-5</option>
                    </select>
                  </div>

                  <div>
                    <span className="text-xs text-gray-500 block mb-1">Streaming</span>
                    <label className="inline-flex items-center gap-2">
                      <input type="checkbox" checked={puterStreaming} onChange={(e) => setPuterStreaming(e.target.checked)} className="h-4 w-4" />
                      <span className="text-xs text-gray-400">Enable streaming (for long responses)</span>
                    </label>
                  </div>
                </div>
              )}

              <p className="text-xs text-white/40">
                Puter is a client-side access layer to Anthropic Claude. It uses a user-pays model (no server API key required). Enabling it will allow the client to call Claude directly via Puter.js — be sure users understand any usage or billing implications.
              </p>
            </div>
          )}

          {/* Ollama URL */}
          {config.provider === "ollama" && (
            <div>
              <label className="text-sm font-semibold text-gray-300 mb-2 block">Ollama Server URL</label>
              <input
                type="text"
                value={config.ollamaUrl || ""}
                onChange={(e) => handleOllamaUrlChange(e.target.value)}
                placeholder="http://localhost:11434"
                className="w-full bg-[#3e3e42] border border-[#4e4e52] rounded px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Make sure Ollama is running locally. Download from: ollama.ai
              </p>
            </div>
          )}

          {/* Provider Info */}
          <div className="bg-[#3e3e42] rounded p-3 text-sm">
            <p className="text-gray-300 font-semibold mb-2">
              {config.provider === "gemini" && "Google Gemini"}
              {config.provider === "ollama" && "Ollama (Local)"}
              {config.provider === "huggingface" && "HuggingFace"}
              {config.provider === "groq" && "Groq"}
            </p>
            <ul className="text-gray-400 space-y-1 text-xs">
              {config.provider === "gemini" && (
                <>
                  <li>✓ Fast and reliable</li>
                  <li>✓ Good for complex layouts</li>
                  <li>✓ Free tier: $300 credit</li>
                </>
              )}
              {config.provider === "ollama" && (
                <>
                  <li>✓ Completely local - no API calls</li>
                  <li>✓ 100% free and private</li>
                  <li>✓ Requires local setup</li>
                </>
              )}
              {config.provider === "huggingface" && (
                <>
                  <li>✓ Free tier available</li>
                  <li>✓ Multiple models to choose from</li>
                  <li>✓ Rate limited</li>
                </>
              )}
              {config.provider === "groq" && (
                <>
                  <li>✓ Very fast inference</li>
                  <li>✓ Free with generous limits</li>
                  <li>✓ No credit card required</li>
                </>
              )}
              {config.provider === 'claude' && (
                <>
                  <li>✓ Anthropic Claude (server)</li>
                  <li>✓ Supports multiple Claude models</li>
                  <li>✓ Requires server-side API key</li>
                </>
              )}
              {config.provider === 'puter' && (
                <>
                  <li>✓ Client-side access to Anthropic Claude (via Puter.js)</li>
                  <li>✓ No API key required (user-pays model)</li>
                  <li>✓ Quick for prototyping and demos; consider server proxy for production</li>
                </>
              )}
            </ul>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <button
              onClick={async () => {
                if (config.provider === "gemini" && !providerKeyInput) {
                  toast.error("Please enter Gemini API Key first");
                  return;
                }
                if (config.provider === "groq" && !providerKeyInput) {
                  toast.error("Please enter Groq API Key first");
                  return;
                }
                if (config.provider === "huggingface" && !providerKeyInput) {
                  toast.error("Please enter HuggingFace API Key first");
                  return;
                }

                try {
                  if (config.provider === 'claude') {
                    // Attempt a small API call to test the API key & model
                    try {
                      const { default: callClaudeChat } = await import('@/lib/claude-client');
                      const model = localStorage.getItem('claude_model') || 'claude-3-opus';
                      const resp: any = await callClaudeChat('Say hi', providerKeyInput, { model, stream: false });
                      if (resp && (resp.completion || resp.output || resp?.completion?.length >= 0)) {
                        toast.success('✓ Claude connection successful!');
                      } else {
                        toast.error('✗ Claude returned no text');
                      }
                    } catch (err: any) {
                      toast.error(`✗ Claude test failed: ${err?.message ?? String(err)}`);
                    }
                    return;
                  }
                  if (config.provider === 'openai') {
                    try {
                      const r = await fetch('https://api.openai.com/v1/models', {
                        headers: { Authorization: `Bearer ${providerKeyInput}` },
                      });
                      if (r.ok) toast.success('✓ OpenAI connection successful!');
                      else toast.error('✗ OpenAI connection failed');
                    } catch (err: any) {
                      toast.error(`✗ OpenAI test failed: ${err?.message ?? String(err)}`);
                    }
                    return;
                  }
                  if (config.provider === 'deepseek') {
                    try {
                      // DeepSeek endpoints vary; perform a basic model list ping if available
                      const r = await fetch('https://api.deepseek.ai/v1/models', {
                        headers: { Authorization: `Bearer ${providerKeyInput}` },
                      });
                      if (r.ok) toast.success('✓ DeepSeek connection successful!');
                      else toast.error('✗ DeepSeek connection failed');
                    } catch (err: any) {
                      toast.error(`✗ DeepSeek test failed: ${err?.message ?? String(err)}`);
                    }
                    return;
                  }
                  if (config.provider === "gemini") {
                    const { testConnection } = await import("@/lib/gemini");
                    const result = await testConnection(providerKeyInput, config.geminiModel || '');
                    if (result) {
                      toast.success("✓ Gemini API connection successful!");
                    } else {
                      toast.error("✗ Gemini API connection failed");
                    }
                  } else if (config.provider === 'puter') {
                    try {
                      const { default: callPuterChat } = await import('@/lib/puter-client');
                      const model = localStorage.getItem('puter_model') || 'claude-sonnet-4-5';
                      const resp: any = await callPuterChat('Say hi', { model });
                      const text = resp?.message?.content?.[0]?.text ?? '';
                      if (text && text.length > 0) {
                        toast.success('✓ Puter / Claude connection successful!');
                      } else {
                        toast.error('✗ Puter returned no text');
                      }
                    } catch (err: any) {
                      toast.error(`✗ Puter test failed: ${err?.message ?? String(err)}`);
                    }
                  } else if (config.provider === "ollama") {
                    const response = await fetch(`${config.ollamaUrl || "http://localhost:11434"}/api/tags`);
                    if (response.ok) {
                      toast.success("✓ Ollama connection successful!");
                    } else {
                      toast.error("✗ Ollama connection failed");
                    }
                  } else if (config.provider === "groq") {
                    const response = await fetch("https://api.groq.com/openai/v1/models", {
                      headers: { Authorization: `Bearer ${providerKeyInput}` },
                    });
                    if (response.ok) {
                      toast.success("✓ Groq API connection successful!");
                    } else {
                      toast.error("✗ Groq API key invalid");
                    }
                  } else if (config.provider === "huggingface") {
                    const response = await fetch("https://huggingface.co/api/whoami", {
                      headers: { Authorization: `Bearer ${providerKeyInput}` },
                    });
                    if (response.ok) {
                      toast.success("✓ HuggingFace connection successful!");
                    } else {
                      toast.error("✗ HuggingFace API key invalid");
                    }
                  }
                } catch (error: any) {
                  toast.error(`✗ Connection test failed: ${error.message}`);
                }
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded transition-colors"
            >
              Test Connection
            </button>
            <button
              onClick={() => {
                // Persist Puter settings if applicable
                if (config.provider === 'puter') {
                  if (puterEnabled) {
                    localStorage.setItem('puter_enabled', '1');
                    localStorage.setItem('puter_model', puterModel);
                    localStorage.setItem('puter_stream', puterStreaming ? '1' : '0');
                  } else {
                    localStorage.removeItem('puter_enabled');
                    localStorage.removeItem('puter_model');
                    localStorage.removeItem('puter_stream');
                  }
                }

                saveAIConfig(config);
                toast.success(`✓ Saved ${config.provider} configuration`);
                setOpen(false);
              }}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded transition-colors"
            >
              <Check className="inline mr-2 w-4 h-4" /> Save
            </button>
            <button
              onClick={() => setOpen(false)}
              className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-semibold py-2 px-4 rounded transition-colors"
            >
              <X className="inline mr-2 w-4 h-4" /> Close
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AIModelSelector;
