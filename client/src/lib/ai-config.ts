import type { AIProvider, AIConfig } from "./ai-service";

const _IM = ((import.meta as any)?.env ?? {}) as Record<string, string>;
const ENV_GEMINI_KEY = _IM.VITE_GEMINI_API_KEY || "";
const ENV_HUGGINGFACE_KEY = _IM.VITE_HUGGINGFACE_KEY || "";
const ENV_GROQ_API_KEY = _IM.VITE_GROQ_API_KEY || "";
const ENV_OLLAMA_URL = _IM.VITE_OLLAMA_URL || "http://localhost:11434";

// We keep secrets out of the main ai-config object to avoid accidental persistence/logging.
// Keys are stored separately per provider (+ per model when applicable).
const LS_CONFIG_KEY = "ai-config";
const LS_KEY_PREFIX = "ai-key:";

// Shared EventTarget for ai-config events (works in Node & Browsers)
export const aiConfigEvents = new EventTarget();

function providerKeyStorageKey(provider: AIProvider, modelId?: string): string {
  // Example:
  // - ai-key:gemini
  // - ai-key:groq
  // - ai-key:huggingface:stabilityai/stable-diffusion-xl-base-1.0
  return modelId && modelId.trim().length > 0
    ? `${LS_KEY_PREFIX}${provider}:${modelId}`
    : `${LS_KEY_PREFIX}${provider}`;
}

export function getStoredProviderKey(provider: AIProvider, modelId?: string): string {
  // Prefer per-model key, then provider-wide key.
  const byModel = modelId ? localStorage.getItem(providerKeyStorageKey(provider, modelId)) : null;
  if (byModel && byModel.trim().length > 0) return byModel;

  const byProvider = localStorage.getItem(providerKeyStorageKey(provider));
  return byProvider && byProvider.trim().length > 0 ? byProvider : "";
}

export function setStoredProviderKey(provider: AIProvider, key: string, modelId?: string): void {
  const storageKey = providerKeyStorageKey(provider, modelId);
  const k = key ?? "";
  if (k.trim().length === 0) localStorage.removeItem(storageKey);
  else localStorage.setItem(storageKey, k);
  // Notify other parts of the app that keys/config changed so UI can update immediately
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('ai-config-changed'));
    }
  } catch (e) {
    // ignore
  }
  try {
    // Fire on a shared EventTarget so Node tests (and other runtimes) can observe the change.
    aiConfigEvents.dispatchEvent(new Event('ai-config-changed'));
  } catch (e) {
    // ignore
  }
}

function nonSecretConfig(config: AIConfig): AIConfig {
  // Strip secret fields before saving the config object.
  const { provider, ollamaUrl, huggingfaceModel, geminiModel, openaiModel, deepseekModel } = config as any;
  return { provider, ollamaUrl, huggingfaceModel, geminiModel, openaiModel, deepseekModel } as AIConfig;
}

import registry from './ai-model-registry.json';

const DEFAULT_CONFIG: AIConfig = {
  provider: "gemini",
  huggingfaceModel: registry.huggingface?.models?.[0] || "stabilityai/stable-diffusion-xl-base-1.0",
  geminiModel: registry.gemini?.models?.[0] || "gemini-pro-1",
  openaiModel: registry.openai?.models?.[0] || "gpt-4o-mini",
  deepseekModel: registry.deepseek?.models?.[0] || "deepseek-general-v1",
  ollamaUrl: ENV_OLLAMA_URL,
};

export function getAIConfig(): AIConfig { 
  const stored = localStorage.getItem(LS_CONFIG_KEY);

  // Load non-secret config (provider, model selection, URLs)
  const base: AIConfig = stored ? (JSON.parse(stored) as AIConfig) : { ...DEFAULT_CONFIG };

  // Defaults
  if (!base.provider) base.provider = "gemini";
  if (!base.ollamaUrl) base.ollamaUrl = ENV_OLLAMA_URL;
  if (!base.huggingfaceModel) base.huggingfaceModel = DEFAULT_CONFIG.huggingfaceModel;
  if (!base.geminiModel) base.geminiModel = "gemini-pro-1";
  if (!base.openaiModel) base.openaiModel = "gpt-4o-mini";
  if (!base.deepseekModel) base.deepseekModel = "deepseek-general-v1";

  // Back-compat migration:
  // Older versions stored keys directly on ai-config.apiKey / ai-config.groqApiKey.
  // Move those into per-provider storage if present.
  if (stored) {
    const parsed = JSON.parse(stored) as AIConfig;
    if (typeof parsed.apiKey === "string" && parsed.apiKey.trim().length > 0) {
      // We can't know whether it was gemini or hf; use current provider to decide.
      if (parsed.provider === "huggingface") {
        setStoredProviderKey("huggingface", parsed.apiKey, parsed.huggingfaceModel);
      } else {
        setStoredProviderKey("gemini", parsed.apiKey);
      }
    }
    if (typeof parsed.groqApiKey === "string" && parsed.groqApiKey.trim().length > 0) {
      setStoredProviderKey("groq", parsed.groqApiKey);
    }
  }

  // Hydrate secrets into the returned config (but we DO NOT persist them in ai-config).
  const provider = base.provider;
  const huggingfaceModel = base.huggingfaceModel;

  const out: AIConfig = { ...base };

  if (provider === "gemini") {
    out.apiKey = getStoredProviderKey("gemini") || ENV_GEMINI_KEY;
  } else if (provider === "huggingface") {
    out.apiKey = getStoredProviderKey("huggingface", huggingfaceModel) || ENV_HUGGINGFACE_KEY;
  } else if (provider === "groq") {
    out.groqApiKey = getStoredProviderKey("groq") || ENV_GROQ_API_KEY;
  }

  return out;
}

export function saveAIConfig(config: AIConfig): void {
  localStorage.setItem(LS_CONFIG_KEY, JSON.stringify(nonSecretConfig(config)));
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('ai-config-changed'));
    }
  } catch (e) {
    // ignore
  }
  try {
    aiConfigEvents.dispatchEvent(new Event('ai-config-changed'));
  } catch (e) {
    // ignore
  }
}

export function setAIProvider(provider: AIProvider): void {
  const config = getAIConfig();
  config.provider = provider;
  saveAIConfig(config);
}

export function setAIApiKey(key: string): void {
  const config = getAIConfig();
  config.apiKey = key;
  saveAIConfig(config);
}

export function setGroqApiKey(key: string): void {
  const config = getAIConfig();
  config.groqApiKey = key;
  saveAIConfig(config);
}

export function setOllamaUrl(url: string): void {
  const config = getAIConfig();
  config.ollamaUrl = url;
  saveAIConfig(config);
}
