import type { TemplateElement } from "../types/templates";
import {
  applyAiActions,
  normalizeAiOutput,
  parseHtmlElementsFromText,
  parseJsonElementsFromText,
  type AIGenerationStrategy,
  type AiActionsResponse,
} from "./template-ai";
import { normalizeLayoutTree } from "./layout-tree";
import { getStoredProviderKey } from './ai-config';
import { htmlToElements } from "./layout-html";
import callPuterChat from "../lib/puter-client";
import callClaudeChat from "./claude-client";
import html2canvas from "html2canvas";

type GenerateLayoutOptions = { strategy?: AIGenerationStrategy };

function extractJsonObject(text: string): string {
  const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return cleaned;
  return cleaned.slice(start, end + 1);
}

function summarizeElementsForPrompt(elements: TemplateElement[]): unknown {
  const MAX_TEXT = 120;
  const MAX_SVG = 160;

  return elements.map((el) => {
    const base: any = {
      id: el.id,
      type: el.type,
      name: (el as any).name,
      x: el.x,
      y: el.y,
      width: el.width,
      height: el.height,
      rotation: (el as any).rotation ?? 0,
      zIndex: el.zIndex,
    };

    if (el.type === "text") {
      const content = (el as any).content;
      if (typeof content === "string") base.content = content.slice(0, MAX_TEXT);
      base.fontSize = (el as any).fontSize;
      base.color = (el as any).color;
      base.textAlign = (el as any).textAlign;
    }

    if (el.type === "shape") {
      base.shape = (el as any).shape;
      base.color = (el as any).color;
    }

    if (el.type === "svg") {
      const content = (el as any).content;
      if (typeof content === "string") base.content = content.slice(0, MAX_SVG);
      base.fill = (el as any).fill;
      base.stroke = (el as any).stroke;
    }

    if (el.type === "image") {
      const src = (el as any).src;
      base.src = typeof src === "string" ? (src.startsWith("data:image/") ? "__DATA_URI_OMITTED__" : src.slice(0, 120)) : "";
    }

    if (el.type === "icon") {
      base.iconName = (el as any).iconName;
      base.color = (el as any).color;
    }

    return base;
  });
}

const ACTIONS_PROVIDER_SYSTEM_PROMPT = `You are an AI layout engine for a CANVAS-based design tool.
Return ONLY a raw JSON object: {"actions": [...] }.
Actions:
- { op: "create", element: TemplateElement }
- { op: "update", id: string, patch: Partial<TemplateElement> } // patch only includes changed fields; use null to remove an optional field
- { op: "delete", id: string }
Do NOT return a full TemplateElement[] array.`;

// Puter-specific rule set: be strict about returning only elements/actions in our schema.

export type AIProvider = "gemini" | "ollama" | "huggingface" | "groq" | "puter" | "claude" | "openai" | "deepseek";

export interface AIConfig {
  provider: AIProvider;
  apiKey?: string;
  ollamaUrl?: string;
  huggingfaceModel?: string;
  groqApiKey?: string;
  claudeApiKey?: string;
  // Optional per-provider selected models/metadata
  geminiModel?: string;
  openaiApiKey?: string;
  openaiModel?: string;
  deepseekApiKey?: string;
  deepseekModel?: string;
}

export interface AIResponse {
  elements: TemplateElement[];
  error?: string;
}

class AIService {
  private config: AIConfig;

  constructor(config: AIConfig) {
    this.config = config;
  }

  private async generateWithClaude(
    systemPrompt: string,
    userPrompt: string,
    currentElements: TemplateElement[],
    canvasWidth: number,
    canvasHeight: number,
    options?: GenerateLayoutOptions
  ): Promise<TemplateElement[]> {
    const apiKey = this.config.claudeApiKey || (typeof window !== 'undefined' && getStoredProviderKey('claude') as string) || '';
    if (!apiKey) throw new Error('Claude API key is missing. Please add it in Settings ⚙️');

    const strategy: AIGenerationStrategy = options?.strategy ?? 'full';

    // Build a prompt body similar to other providers
    const promptBody = `${systemPrompt}\n\nCanvas: ${canvasWidth}x${canvasHeight}\nCurrent elements: ${JSON.stringify(currentElements)}\n\nCommand: ${userPrompt}`;

    try {
      const result = await callClaudeChat(promptBody, apiKey, { model: (localStorage.getItem('claude_model') as string) || 'claude-3-opus' });

      // Anthropic response shape may vary; attempt to extract text
      const content = result?.completion || result?.output || result?.completion?.text || String(result);

      if (strategy === 'schema') {
        const obj = JSON.parse(extractJsonObject(content)) as AiActionsResponse;
        const actions = Array.isArray((obj as any)?.actions) ? (obj as any).actions : [];
        return applyAiActions(currentElements, actions, canvasWidth, canvasHeight, userPrompt);
      }

      // Try JSON first
      const parsedJson = parseJsonElementsFromText(content, canvasWidth, canvasHeight);
      if (parsedJson && parsedJson.length > 0) return parsedJson;

      // Try array-style JSON
      const jsonMatch = String(content).match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const raw = JSON.parse(jsonMatch[0]);
        const fromTree = normalizeLayoutTree(raw, canvasWidth, canvasHeight);
        if (fromTree.length > 0) return fromTree;
        return normalizeAiOutput(raw, canvasWidth, canvasHeight);
      }

      // Try HTML parsing
      try {
        const parsedHtml = String(content).includes('```html') ? String(content).split('```html')[1].split('```')[0].trim() : String(content);
        const parsedHtmlElements = parseHtmlElementsFromText(parsedHtml, canvasWidth, canvasHeight);
        if (parsedHtmlElements && parsedHtmlElements.length > 0) return parsedHtmlElements;
        if (typeof document !== 'undefined') {
          const domParsed = htmlToElements(parsedHtml, canvasWidth, canvasHeight);
          if (domParsed.length > 0) return domParsed;
        }
      } catch (err) {
        console.warn('Failed to parse Claude output:', (err as any)?.message ?? String(err));
      }

      return currentElements;
    } catch (error) {
      console.error('Claude generation error', error);
      return currentElements;
    }
  }

  async generateLayout(
    prompt: string,
    currentElements: TemplateElement[],
    canvasWidth: number,
    canvasHeight: number,
    options?: GenerateLayoutOptions,
    htmlLayout?: string,
  ): Promise<TemplateElement[]> {
    const systemPrompt = this.buildSystemPrompt(canvasWidth, canvasHeight, htmlLayout ?? '', prompt);

    switch (this.config.provider) {
      case "puter":
        return this.generateWithPuter(
          systemPrompt,
          prompt,
          currentElements,
          canvasWidth,
          canvasHeight,
          options,
          htmlLayout

        );
      case "claude":
        return this.generateWithClaude(
          systemPrompt,
          prompt,
          currentElements,
          canvasWidth,
          canvasHeight,
          options
        );
      case "ollama":
        return this.generateWithOllama(
          systemPrompt,
          prompt,
          currentElements,
          canvasWidth,
          canvasHeight,
          options
        );
      case "huggingface":
        return this.generateWithHuggingFace(
          systemPrompt,
          prompt,
          currentElements,
          canvasWidth,
          canvasHeight,
          options
        );
      case "groq":
        return this.generateWithGroq(
          systemPrompt,
          prompt,
          currentElements,
          canvasWidth,
          canvasHeight,
          options
        );
      case "openai":
        return this.generateWithOpenAI(
          systemPrompt,
          prompt,
          currentElements,
          canvasWidth,
          canvasHeight,
          options
        );
      case "deepseek":
        return this.generateWithDeepSeek(
          systemPrompt,
          prompt,
          currentElements,
          canvasWidth,
          canvasHeight,
          options
        );
      case "gemini":
      default:
        return this.generateWithGemini(
          this.config.apiKey || "",
          systemPrompt,
          prompt,
          currentElements,
          canvasWidth,
          canvasHeight,
          options,
          htmlLayout
        );
    }
  }

  private async generateWithOpenAI(
    systemPrompt: string,
    userPrompt: string,
    currentElements: TemplateElement[],
    canvasWidth: number,
    canvasHeight: number,
    options?: GenerateLayoutOptions
  ): Promise<TemplateElement[]> {
    const apiKey = this.config.openaiApiKey || (typeof window !== 'undefined' && getStoredProviderKey('openai') as string) || '';
    if (!apiKey) throw new Error('OpenAI API key is missing. Please add it in Settings ⚙️');

    const model = this.config.openaiModel || (typeof window !== 'undefined' && localStorage.getItem('openai_model')) || 'gpt-4o-mini';

    const strategy: AIGenerationStrategy = options?.strategy ?? 'full';

    const messages =
      strategy === 'schema'
        ? [
            { role: 'system', content: ACTIONS_PROVIDER_SYSTEM_PROMPT },
            { role: 'user', content: `Canvas: ${canvasWidth}x${canvasHeight}\nExisting element summary: ${JSON.stringify(summarizeElementsForPrompt(currentElements))}\n\nCommand: ${userPrompt}` },
          ]
        : [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Canvas: ${canvasWidth}x${canvasHeight}\nCurrent elements: ${JSON.stringify(currentElements)}\n\nCommand: ${userPrompt}` },
          ];

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages }),
      });

      if (!response.ok) throw new Error(`OpenAI API error: ${response.status}`);

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content ?? String(data);

      if (strategy === 'schema') {
        const obj = JSON.parse(extractJsonObject(content)) as AiActionsResponse;
        const actions = Array.isArray((obj as any)?.actions) ? (obj as any).actions : [];
        return applyAiActions(currentElements, actions, canvasWidth, canvasHeight, userPrompt);
      }

      const parsedJson = parseJsonElementsFromText(content, canvasWidth, canvasHeight);
      if (parsedJson && parsedJson.length > 0) return parsedJson;

      const jsonMatch = String(content).match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const raw = JSON.parse(jsonMatch[0]);
        const fromTree = normalizeLayoutTree(raw, canvasWidth, canvasHeight);
        if (fromTree.length > 0) return fromTree;
        return normalizeAiOutput(raw, canvasWidth, canvasHeight);
      }

      try {
        const parsedHtml = String(content).includes('```html') ? String(content).split('```html')[1].split('```')[0].trim() : String(content);
        const parsedHtmlElements = parseHtmlElementsFromText(parsedHtml, canvasWidth, canvasHeight);
        if (parsedHtmlElements && parsedHtmlElements.length > 0) return parsedHtmlElements;
        if (typeof document !== 'undefined') {
          const domParsed = htmlToElements(parsedHtml, canvasWidth, canvasHeight);
          if (domParsed.length > 0) return domParsed;
        }
      } catch (err) {
        console.warn('Failed to parse OpenAI output:', (err as any)?.message ?? String(err));
      }

      return currentElements;
    } catch (error) {
      console.error('OpenAI generation error', error);
      return currentElements;
    }
  }

  private async generateWithDeepSeek(
    systemPrompt: string,
    userPrompt: string,
    currentElements: TemplateElement[],
    canvasWidth: number,
    canvasHeight: number,
    options?: GenerateLayoutOptions
  ): Promise<TemplateElement[]> {
    const apiKey = this.config.deepseekApiKey || (typeof window !== 'undefined' && getStoredProviderKey('deepseek') as string) || '';
    if (!apiKey) throw new Error('DeepSeek API key is missing. Please add it in Settings ⚙️');

    const base = 'https://api.deepseek.com';
    const model = this.config.deepseekModel || (typeof window !== 'undefined' && localStorage.getItem('deepseek_model')) || 'deepseek-chat';

    const strategy: AIGenerationStrategy = options?.strategy ?? 'full';

    const messages =
      strategy === 'schema'
        ? [{ role: 'user', content: `Canvas: ${canvasWidth}x${canvasHeight}\nExisting element summary: ${JSON.stringify(summarizeElementsForPrompt(currentElements))}\n\nCommand: ${userPrompt}` }]
        : [{ role: 'user', content: systemPrompt }, { role: 'user', content: `Canvas: ${canvasWidth}x${canvasHeight}\nCurrent elements: ${JSON.stringify(currentElements)}\n\nCommand: ${userPrompt}` }];

    try {
      // Use server-side proxy for DeepSeek to avoid exposing keys from the client
      const response = await fetch('/api/ai/deepseek', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages }),
      });

      if (!response.ok) {
        const txt = await response.text();
        throw new Error(`DeepSeek proxy error: ${response.status} ${txt}`);
      }

      const data = await response.json();
      const content = data?.content ?? String(data);

      if (strategy === 'schema') {
        const obj = JSON.parse(extractJsonObject(content)) as AiActionsResponse;
        const actions = Array.isArray((obj as any)?.actions) ? (obj as any).actions : [];
        return applyAiActions(currentElements, actions, canvasWidth, canvasHeight, userPrompt);
      }

      const parsedJson = parseJsonElementsFromText(content, canvasWidth, canvasHeight);
      if (parsedJson && parsedJson.length > 0) return parsedJson;

      const jsonMatch = String(content).match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const raw = JSON.parse(jsonMatch[0]);
        const fromTree = normalizeLayoutTree(raw, canvasWidth, canvasHeight);
        if (fromTree.length > 0) return fromTree;
        return normalizeAiOutput(raw, canvasWidth, canvasHeight);
      }

      try {
        const parsedHtml = String(content).includes('```html') ? String(content).split('```html')[1].split('```')[0].trim() : String(content);
        const parsedHtmlElements = parseHtmlElementsFromText(parsedHtml, canvasWidth, canvasHeight);
        if (parsedHtmlElements && parsedHtmlElements.length > 0) return parsedHtmlElements;
        if (typeof document !== 'undefined') {
          const domParsed = htmlToElements(parsedHtml, canvasWidth, canvasHeight);
          if (domParsed.length > 0) return domParsed;
        }
      } catch (err) {
        console.warn('Failed to parse DeepSeek output:', (err as any)?.message ?? String(err));
      }

      return currentElements;
    } catch (error) {
      console.error('DeepSeek generation error', error);
      return currentElements;
    }
  }

  private getSystemPrompt(userPrompt: string = ""): string {
    // Don't override - let gemini.ts handle system prompts
    // This method is kept for backwards compatibility but returns null
    // so the generateLayout function in gemini.ts uses its own SYSTEM_PROMPT
    return "";
  }

  /**
   * Build the canonical SYSTEM_PROMPT used across all providers.
   * This centralizes rules about canvas size, allowed tags, and output format.
   */
  private buildSystemPrompt(
    canvasWidth: number,
    canvasHeight: number,
    currentHtml: string,
    userPrompt: string
  ): string {
    return `You are a STRICT, OUTPUT-ONLY assistant for an ABSOLUTE-POSITION CANVAS DESIGN TOOL.

Your task is to generate or update a visual layout based on the user request.

=====================
INPUT VARIABLES
=====================
Canvas size (EXACT): ${canvasWidth}px × ${canvasHeight}px
Existing HTML (may be empty): 
${currentHtml}

User request:
${userPrompt}

=====================
OUTPUT RULES (MANDATORY)
=====================
- Return ONLY valid HTML (NO explanations, NO markdown, NO code blocks).
- Output MUST be a SINGLE root <div> with 'position: relative'.
- ALL child elements MUST be '<div>' elements with 'position: absolute'.
- Do NOT include <html>, <head>, <body>, <style>, <script>, <span>, or any other tags.
- Do NOT use flex, grid, containers, or children nesting.
- Do NOT nest divs inside absolute divs.
- Coordinates use PIXELS with a top-left origin.
- ALL elements MUST fit fully inside the canvas.
- Root div size MUST be exactly ${canvasWidth}px × ${canvasHeight}px.

=====================
ELEMENT RULES
=====================
- Every absolute div MUST have a unique 'id'.
- Text must be placed directly inside its own absolute div.
- Images must be placed inside their own absolute div using '<img>':
  - Image source must be BASE64 only.
- SVGs:
  - Must be inside their own absolute div.
  - Must be centered and scaled to fit within that div.
- A single div MAY be used as a visual element (shape, gradient, glow, etc.).
- Shadows, gradients, blur, and visual effects are allowed.
- Use modern design principles:
  - Contrast
  - Visual hierarchy
  - Whitespace
  - Readability
  - Strong visual impact
- Design should be suitable for:
  - Marketing banners
  - Social media posts
  - Ads
  - Promotional creatives

=====================
UPDATE RULES
=====================
- If ${currentHtml} is NOT empty:
  - Preserve existing good elements.
  - Modify or improve layout ONLY as requested.
  - Reference existing elements ONLY by their 'id'.
- If ${currentHtml} is empty:
  - Create a NEW layout from scratch.

=====================
ABSOLUTE CONSTRAINTS
=====================
- This is an ABSOLUTE-POSITION CANVAS. NO layout systems.
- NO nested divs.
- NO overflow outside canvas.
- NO extra text before or after HTML. 

=====================
FINAL INSTRUCTION
=====================
Return ONLY the COMPLETE HTML structure that satisfies ALL rules above.
`;
  }

  private async generateWithGemini(
    apiKey: string,
    systemPrompt: string,
    userPrompt: string,
    currentElements: TemplateElement[],
    canvasWidth: number,
    canvasHeight: number,
    options?: GenerateLayoutOptions,
    currentHtml?: string,
  ): Promise<TemplateElement[]> {
    if (!apiKey || apiKey.trim() === "") {
      throw new Error("Gemini API Key is missing. Please add it in Settings ⚙️");
    }
    const { generateLayout } = await import("./gemini");
    // Prefer configured model from AIConfig or localStorage
    const geminiModel = this.config.geminiModel || (typeof window !== 'undefined' && localStorage.getItem('gemini_model')) || undefined;
    // Use the centralized system prompt for Gemini generation
    console.log(systemPrompt, userPrompt, { preferredModel: geminiModel });
    const res = await generateLayout(apiKey, userPrompt, currentElements, canvasWidth, canvasHeight, systemPrompt, options, geminiModel);
    if (typeof res === 'string') {
      // Try to parse returned HTML/JSON into TemplateElements (server-side parser first)
      const parsedJson = parseJsonElementsFromText(res, canvasWidth, canvasHeight);
      if (parsedJson && parsedJson.length > 0) return parsedJson;
      const parsedHtml = parseHtmlElementsFromText(res, canvasWidth, canvasHeight);
      if (parsedHtml && parsedHtml.length > 0) return parsedHtml;
      if (typeof document !== 'undefined') {
        const domParsed = htmlToElements(res, canvasWidth, canvasHeight);
        if (domParsed && domParsed.length > 0) return domParsed;
      }
      return currentElements;
    }
    return res;
  }

  private async generateWithPuter(
    systemPrompt: string,
    userPrompt: string,
    currentElements: TemplateElement[],
    canvasWidth: number,
    canvasHeight: number,
    options?: GenerateLayoutOptions,
    currentHtml?: string,
  ): Promise<TemplateElement[]> {
    const strategy: AIGenerationStrategy = options?.strategy ?? "full";

    // Determine model from localStorage (UI stores this in settings when enabling Puter)
    const model = (typeof window !== 'undefined' && localStorage.getItem('puter_model')) || 'claude-sonnet-4-5';

    const baseInstructions = strategy === 'schema' ? ACTIONS_PROVIDER_SYSTEM_PROMPT : systemPrompt;
    const promptBody = `${systemPrompt}\n\nCanvas: ${canvasWidth}x${canvasHeight}\nExisting element summary: ${JSON.stringify(
      summarizeElementsForPrompt(currentElements)
    )}\n\nCommand: ${userPrompt}`;

    try {
      const resp: any = await callPuterChat(promptBody, { model, stream: false });
      // Puter responses may nest the message in different places depending on SDK/format.
      // Handle both `resp.message.content[0].text` and `resp.result.message.content[0].text`.
      const content =
        resp?.message?.content?.[0]?.text ?? resp?.result?.message?.content?.[0]?.text ?? String(resp ?? "");

      if (strategy === 'schema') {
        const obj = JSON.parse(extractJsonObject(content)) as AiActionsResponse;
        const actions = Array.isArray((obj as any)?.actions) ? (obj as any).actions : [];
        return applyAiActions(currentElements, actions, canvasWidth, canvasHeight, userPrompt);
      }

      // Try JSON parsing first (includes ```json code fences or bare objects/arrays)
      const parsedJson = parseJsonElementsFromText(content, canvasWidth, canvasHeight);
      if (parsedJson && parsedJson.length > 0) return parsedJson;

      // Try to parse an array-style response (layout tree)
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const raw = JSON.parse(jsonMatch[0]);
        const fromTree = normalizeLayoutTree(raw, canvasWidth, canvasHeight);
        if (fromTree.length > 0) return fromTree;
        return normalizeAiOutput(raw, canvasWidth, canvasHeight);
      }


      // Also attempt to parse simple HTML snippets (Puter often returns HTML code fences)
      try {
        // unwrap code fence if present
        const parsedHtml = content.includes('```html')
          ? content.split('```html')[1].split('```')[0].trim()
          : content;

        // First, try our HTML->TemplateElement parser (works in Node too)
        const parsedHtmlElements = parseHtmlElementsFromText(parsedHtml, canvasWidth, canvasHeight);
        if (parsedHtmlElements && parsedHtmlElements.length > 0) return parsedHtmlElements;

        // If running in a browser, try a DOM-based parser for better fidelity
        if (typeof document !== 'undefined') {
          const domParsed = htmlToElements(parsedHtml, canvasWidth, canvasHeight);
          if (domParsed.length > 0) return domParsed;
        }
      } catch (e) {
        console.warn('Failed to parse Puter HTML output:', (e as any)?.message ?? String(e));
      }

      // If no parsing succeeded, return the current elements unchanged.
      return currentElements;

      return currentElements;
    } catch (error) {
      console.error('Puter generation error', error);
      return currentElements;
    }
  }
  private async generateWithOllama(
    systemPrompt: string,
    userPrompt: string,
    currentElements: TemplateElement[],
    canvasWidth: number,
    canvasHeight: number,
    options?: GenerateLayoutOptions
  ): Promise<TemplateElement[]> {
    const ollamaUrl = this.config.ollamaUrl || "http://localhost:11434";
    const model = "mistral"; // or "llama2"

    const strategy: AIGenerationStrategy = options?.strategy ?? "full";

    const messages =
      strategy === "schema"
        ? [
          { role: "system", content: ACTIONS_PROVIDER_SYSTEM_PROMPT },
          {
            role: "user",
            content: `Canvas: ${canvasWidth}x${canvasHeight}\nExisting element summary: ${JSON.stringify(
              summarizeElementsForPrompt(currentElements)
            )}\n\nCommand: ${userPrompt}`,
          },
        ]
        : [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Canvas: ${canvasWidth}x${canvasHeight}\nCurrent elements: ${JSON.stringify(
              currentElements
            )}\n\nCommand: ${userPrompt}`,
          },
        ];

    try {
      const response = await fetch(`${ollamaUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages, stream: false }),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.message.content;

      if (strategy === "schema") {
        const obj = JSON.parse(extractJsonObject(content)) as AiActionsResponse;
        const actions = Array.isArray((obj as any)?.actions) ? (obj as any).actions : [];
        return applyAiActions(currentElements, actions, canvasWidth, canvasHeight, userPrompt);
      }

      // Extract JSON from response
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const raw = JSON.parse(jsonMatch[0]);
        const fromTree = normalizeLayoutTree(raw, canvasWidth, canvasHeight);
        if (fromTree.length > 0) return fromTree;
        return normalizeAiOutput(raw, canvasWidth, canvasHeight);
      }

      return currentElements;
    } catch (error) {
      console.error("Ollama generation error:", error);
      return currentElements;
    }
  }

  private async generateWithHuggingFace(
    systemPrompt: string,
    userPrompt: string,
    currentElements: TemplateElement[],
    canvasWidth: number,
    canvasHeight: number,
    options?: GenerateLayoutOptions
  ): Promise<TemplateElement[]> {
    const apiKey = this.config.apiKey || "";
    const model = this.config.huggingfaceModel || "mistralai/Mistral-7B-Instruct-v0.1";

    const strategy: AIGenerationStrategy = options?.strategy ?? "full";

    const messages =
      strategy === "schema"
        ? [
          { role: "system", content: ACTIONS_PROVIDER_SYSTEM_PROMPT },
          {
            role: "user",
            content: `Canvas: ${canvasWidth}x${canvasHeight}\nExisting element summary: ${JSON.stringify(
              summarizeElementsForPrompt(currentElements)
            )}\n\nCommand: ${userPrompt}`,
          },
        ]
        : [
          { role: "user", content: systemPrompt },
          {
            role: "user",
            content: `Canvas: ${canvasWidth}x${canvasHeight}\nCurrent elements: ${JSON.stringify(
              currentElements
            )}\n\nCommand: ${userPrompt}`,
          },
        ];

    try {
      const response = await fetch(
        "https://api-inference.huggingface.co/models/" + model,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ inputs: messages }),
        }
      );

      if (!response.ok) {
        throw new Error(`HuggingFace API error: ${response.status}`);
      }

      const data = await response.json();
      const content = Array.isArray(data) ? data[0].generated_text : data.generated_text;

      if (strategy === "schema") {
        const obj = JSON.parse(extractJsonObject(content)) as AiActionsResponse;
        const actions = Array.isArray((obj as any)?.actions) ? (obj as any).actions : [];
        return applyAiActions(currentElements, actions, canvasWidth, canvasHeight, userPrompt);
      }

      // Extract JSON from response
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const raw = JSON.parse(jsonMatch[0]);
        const fromTree = normalizeLayoutTree(raw, canvasWidth, canvasHeight);
        if (fromTree.length > 0) return fromTree;
        return normalizeAiOutput(raw, canvasWidth, canvasHeight);
      }

      return currentElements;
    } catch (error) {
      console.error("HuggingFace generation error:", error);
      return currentElements;
    }
  }

  private async generateWithGroq(
    systemPrompt: string,
    userPrompt: string,
    currentElements: TemplateElement[],
    canvasWidth: number,
    canvasHeight: number,
    options?: GenerateLayoutOptions
  ): Promise<TemplateElement[]> {
    const apiKey = this.config.groqApiKey || (typeof window !== 'undefined' && getStoredProviderKey('groq') as string) || '';
    if (!apiKey) throw new Error('Groq API key is missing. Please add it in Settings ⚙️');

    const model = this.config.groqModel || (typeof window !== 'undefined' && localStorage.getItem('groq_model')) || 'llama-3.3-70b-versatile';

    const strategy: AIGenerationStrategy = options?.strategy ?? "full";

    const messages =
      strategy === "schema"
        ? [
          { role: "system", content: ACTIONS_PROVIDER_SYSTEM_PROMPT },
          {
            role: "user",
            content: `Canvas: ${canvasWidth}x${canvasHeight}\nExisting element summary: ${JSON.stringify(
              summarizeElementsForPrompt(currentElements)
            )}\n\nCommand: ${userPrompt}`,
          },
        ]
        : [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Canvas: ${canvasWidth}x${canvasHeight}\nCurrent elements: ${JSON.stringify(
              currentElements
            )}\n\nCommand: ${userPrompt}`,
          },
        ];

    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.3,
          max_tokens: 2048,
        }),
      });

      if (!response.ok) {
        throw new Error(`Groq API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices[0].message.content;

      if (strategy === "schema") {
        const obj = JSON.parse(extractJsonObject(content)) as AiActionsResponse;
        const actions = Array.isArray((obj as any)?.actions) ? (obj as any).actions : [];
        return applyAiActions(currentElements, actions, canvasWidth, canvasHeight, userPrompt);
      }

      // Try HTML parsing first (Groq compound models return HTML by default)
      try {
        const parsedHtml = content.includes('```html') 
          ? content.split('```html')[1].split('```')[0].trim() 
          : content;
        
        const parsedHtmlElements = parseHtmlElementsFromText(parsedHtml, canvasWidth, canvasHeight);
        if (parsedHtmlElements && parsedHtmlElements.length > 0) return parsedHtmlElements;
        
        if (typeof document !== 'undefined') {
          const domParsed = htmlToElements(parsedHtml, canvasWidth, canvasHeight);
          if (domParsed.length > 0) return domParsed;
        }
      } catch (err) {
        console.warn('Failed to parse Groq HTML output:', err);
      }

      // Extract JSON from response if HTML parsing fails
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const raw = JSON.parse(jsonMatch[0]);
        const fromTree = normalizeLayoutTree(raw, canvasWidth, canvasHeight);
        if (fromTree.length > 0) return fromTree;
        return normalizeAiOutput(raw, canvasWidth, canvasHeight);
      }

      return currentElements;
    } catch (error) {
      console.error("Groq generation error:", error);
      return currentElements;
    }
  }

  async generateDesign(
    userPrompt: string,
    currentHtml: string,
    canvasWidth: number = 1280,
    canvasHeight: number = 720
  ): Promise<string> {
    // Use the centralized system prompt so design generation follows the same rules as other providers
    const DESIGN_SYSTEM_PROMPT = this.buildSystemPrompt(canvasWidth, canvasHeight, currentHtml, userPrompt);

    try {
      const enabled = localStorage.getItem('puter_enabled') === '1';
      if (!enabled) {
        throw new Error('Puter is not enabled');
      }

      const model = localStorage.getItem('puter_model') || 'claude-sonnet-4-5';
      const stream = localStorage.getItem('puter_stream') === '1';

      let response: any;
      if (stream) {
        const it: any = await callPuterChat(DESIGN_SYSTEM_PROMPT, { model, stream: true });
        let acc = '';
        for await (const part of it) {
          acc += part?.text ?? '';
        }
        response = acc;
      } else {
        response = await callPuterChat(DESIGN_SYSTEM_PROMPT, { model, stream: false });
        const text = response?.message?.content?.[0]?.text ?? response?.result?.message?.content?.[0]?.text ?? String(response);
        response = text;
      }

      // Clean up the response to extract just the HTML
      let htmlResult = response;
      if (htmlResult.includes('```html')) {
        htmlResult = htmlResult.split('```html')[1].split('```')[0].trim();
      } else if (htmlResult.includes('```')) {
        htmlResult = htmlResult.split('```')[1].split('```')[0].trim();
      }

      return htmlResult;
    } catch (error) {
      console.error("Design generation error:", error);
      return currentHtml; // Return original HTML on error
    }
  }
}

export default AIService;