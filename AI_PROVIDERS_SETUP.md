# Multi-Provider AI System Setup & Testing Guide

## Overview

Your AI Canvas now supports 4 different AI providers, making it flexible and cost-effective:

1. **Google Gemini** (Primary) - Fast, reliable, good free tier
2. **Ollama** (Local) - Run AI models locally, completely free and private
3. **HuggingFace** (Cloud) - Multiple model options, free tier available
4. **Groq** (Cloud) - Very fast inference, generous free tier

## Quick Start

### 1. Access Settings

Click the **⚙️ Settings** button in the toolbar (top right of the canvas) to open the AI Model Selector.

### 2. Switch Providers

From the dropdown menu, select your preferred AI provider:
- Gemini (default)
- Ollama
- HuggingFace
- Groq

Enter the required credentials for the selected provider.

---

## Provider Setup Instructions

### Google Gemini (Recommended for First Use)

**Status:** Already working - your API key is in `.env`

1. Dialog will show "Gemini" is selected
2. Enter your API key if needed (should auto-populate from `.env`)
3. Click outside dialog or reload to confirm

**Get API Key:** https://ai.google.dev/

---

### Ollama (Free, Local)

**Best For:** Privacy, offline usage, zero cost

1. **Install Ollama:**
   - Visit https://ollama.ai
   - Download and install for your OS
   - Run: `ollama serve` in a terminal

2. **Pull a Model:**
   ```bash
   ollama pull mistral
   # or
   ollama pull neural-chat
   ```

3. **In AI Canvas:**
   - Open Settings
   - Select "Ollama" from dropdown
   - Enter URL: `http://localhost:11434` (or your Ollama server URL)
   - Model should be "mistral" (auto-configured)

4. **Test:**
   - Type: "Add a green button"
   - Check response in console (F12)

---

### HuggingFace (Free Cloud)

**Best For:** Multiple model choices, cloud-based

1. **Get API Key:**
   - Visit https://huggingface.co
   - Sign up (free)
   - Go to Settings → Access Tokens
   - Create a new token (read-only is fine)
   - Copy the token

2. **In AI Canvas:**
   - Open Settings
   - Select "HuggingFace" from dropdown
   - Paste your API token
   - Supported models: mistral-7b, neural-chat, etc.

3. **Test:**
   - Type: "Create a red heading with large text"
   - Monitor network tab (F12) for HuggingFace API calls

---

### Groq (Free Cloud - Fastest)

**Best For:** Speed, free tier, no credit card required

1. **Get API Key:**
   - Visit https://console.groq.com
   - Sign up (free, no credit card needed)
   - Go to API Keys
   - Create a new API key
   - Copy the key

2. **In AI Canvas:**
   - Open Settings
   - Select "Groq" from dropdown
   - Paste your API key
   - Uses mixtral-8x7b-32768 model (already configured)

3. **Test:**
   - Type: "Add a blue card component"
   - Check response time (should be very fast)

---

## How It Works

### Behind the Scenes

```typescript
// When you type a command:
1. AI Model Selector dialog loads current config from localStorage
2. You select provider and enter credentials
3. Config is saved to localStorage automatically
4. When you send a command:
   - CanvasTool reads config with getAIConfig()
   - Creates AIService instance with that config
   - AIService routes request to correct provider method
   - Provider returns TemplateElement[] (JSON with layout info)
   - Elements are rendered on canvas
```

### Configuration Storage

Settings are stored in browser localStorage under key: `"ai-config"`

```json
{
  "provider": "gemini",
  "geminiKey": "your-key-here",
  "ollamaUrl": "http://localhost:11434",
  "huggingfaceKey": "hf_xxxx",
  "groqKey": "gsk_xxxx"
}
```

---

## Testing Each Provider

### Test 1: Basic Layout Generation

**Command:** "Add a centered heading with a button below it"

**Expected Output:**
- One text element (heading)
- One button element
- Both roughly centered on canvas
- Elements have proper styling

### Test 2: Shapes

**Command:** "Create a blue rectangle and a red circle"

**Expected Output:**
- Rectangle shape (blue)
- Circle shape (red)
- Both visible on canvas

### Test 3: Images

**Command:** "Create a 200x200 image of a car"

**Expected Output:**
- Either SVG drawing of a car (preferred)
- Or placeholder with car description

### Troubleshooting

| Issue | Solution |
|-------|----------|
| Blank response | Check API key, check provider is running (Ollama) |
| Timeout | Provider might be slow, try Groq (fastest) |
| "Cannot connect to Ollama" | Make sure `ollama serve` is running |
| "Invalid credentials" | Double-check API key, delete and re-enter |
| Model not found (404) | Some providers might block certain models |

---

## Provider Comparison

| Provider | Cost | Speed | Setup | Privacy |
|----------|------|-------|-------|---------|
| Gemini | Free tier (60/min) | Fast | Easy (1 key) | Cloud |
| Ollama | Free | Depends on hardware | Medium (download) | Local ✓ |
| HuggingFace | Free tier (limited) | Slow-Medium | Medium (1 key) | Cloud |
| Groq | Free (generous) | **Fastest** | Easy (1 key) | Cloud |

---

## Advanced: Environment Variables

You can also set defaults via `.env`:

```env
# Gemini
VITE_GEMINI_API_KEY=your_key_here

# Ollama (if running on different machine)
VITE_OLLAMA_URL=http://192.168.1.100:11434

# HuggingFace
VITE_HUGGINGFACE_KEY=hf_xxxx

# Groq
VITE_GROQ_API_KEY=gsk_xxxx
```

These are used as defaults if nothing is in localStorage.

---

## FAQ

**Q: Can I use multiple providers at the same time?**
A: Yes! You can switch between them anytime. Just reload the page to switch.

**Q: What if one provider is down?**
A: Switch to another. That's the benefit of the multi-provider system!

**Q: Will my API keys be safe?**
A: Keys are stored in browser localStorage. For production, consider:
- Using environment variables only
- Backend proxy (not exposing API keys to frontend)
- Firebase or similar service for secure key management

**Q: Can I add more providers?**
A: Yes! Edit `client/src/lib/ai-service.ts` and add a new method:
```typescript
private async generateWithNewProvider() {
  // Your implementation here
}
```

**Q: Why does the SVG sometimes show instead of PNG?**
A: The AI system prefers SVG for "drawable" content (like cars, shapes) to ensure it actually creates something visible instead of blank boxes.

---

## Quick Reference

### File Locations

- **Settings Dialog:** [client/src/components/AIModelSelector.tsx](client/src/components/AIModelSelector.tsx)
- **AI Service Logic:** [client/src/lib/ai-service.ts](client/src/lib/ai-service.ts)
- **Config Manager:** [client/src/lib/ai-config.ts](client/src/lib/ai-config.ts)
- **Main Integration:** [client/src/pages/CanvasTool.tsx](client/src/pages/CanvasTool.tsx)

### Key Functions

- `getAIConfig()` - Get current AI configuration
- `saveAIConfig(config)` - Save configuration to localStorage
- `AIService.generateLayout()` - Generate layout (routes to provider)

---

## Support

If you encounter issues:

1. **Check Console:** Press F12, go to Console tab, look for error messages
2. **Check Network:** Go to Network tab, look for failed API calls
3. **Test Provider Directly:**
   - Gemini: https://ai.google.dev/
   - Ollama: `curl http://localhost:11434/api/tags`
   - HuggingFace: Try their playground
   - Groq: Try their console

---

**Your system is now ready for multi-provider AI!** 🚀
