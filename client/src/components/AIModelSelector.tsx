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
import { toast } from "sonner";

const HF_IMAGE_MODELS = [
  "stabilityai/stable-diffusion-xl-base-1.0",
  "stabilityai/stable-diffusion-2",
  "runwayml/stable-diffusion-v1-5",
  "DeepFloyd/IF",
  "segmind/DreamShaper",
];

export const AIModelSelector = () => {
  const [config, setConfig] = useState<AIConfig>(getAIConfig());
  const [open, setOpen] = useState(false);

  // Keep inputs separate so we don't accidentally persist secrets in ai-config.
  const [providerKeyInput, setProviderKeyInput] = useState<string>("");

  // Sync config with localStorage when dialog opens
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      // When opening, read fresh config from localStorage
      const fresh = getAIConfig();
      setConfig(fresh);

      if (fresh.provider === "gemini") {
        setProviderKeyInput(getStoredProviderKey("gemini") || fresh.apiKey || "");
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
        <button className="w-10 h-10 rounded-md flex items-center justify-center hover:bg-[#3e3e42] text-gray-400 hover:text-white transition-colors" title="AI Settings">
          <Settings size={20} />
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
              <option value="puter">Puter / Claude (Free - Client-side User-Pays)</option>
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
              <p className="text-xs text-gray-500 mt-1">Stored as: ai-key:gemini</p>
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
            <div>
              <label className="text-sm font-semibold text-gray-300 mb-2 block">Groq API Key</label>
              <input
                type="password"
                value={providerKeyInput}
                onChange={(e) => handleProviderKeyChange(e.target.value)}
                placeholder="gsk_..."
                className="w-full bg-[#3e3e42] border border-[#4e4e52] rounded px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">Stored as: ai-key:groq</p>
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
                  if (config.provider === "gemini") {
                    const { testConnection } = await import("@/lib/gemini");
                    const result = await testConnection(providerKeyInput);
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
