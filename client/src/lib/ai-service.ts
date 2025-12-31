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
import callPuterChat from "../lib/puter-client";
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

export type AIProvider = "gemini" | "ollama" | "huggingface" | "groq" | "puter";

export interface AIConfig {
  provider: AIProvider;
  apiKey?: string;
  ollamaUrl?: string;
  huggingfaceModel?: string;
  groqApiKey?: string;
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

  async generateLayout(
    prompt: string,
    currentElements: TemplateElement[],
    canvasWidth: number,
    canvasHeight: number,
    options?: GenerateLayoutOptions,
    htmlLayout?: string,
  ): Promise<TemplateElement[]> {
    const systemPrompt = this.getSystemPrompt(prompt);

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

  private getSystemPrompt(userPrompt: string = ""): string {
    // Don't override - let gemini.ts handle system prompts
    // This method is kept for backwards compatibility but returns null
    // so the generateLayout function in gemini.ts uses its own SYSTEM_PROMPT
    return "";
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
    // Don't pass systemPrompt - let generateLayout use its own SYSTEM_PROMPT
    const PUTER_ELEMENTS_SYSTEM_PROMPT = `You are a STRICT, OUTPUT-ONLY assistant for an ABSOLUTE-POSITION CANVAS DESIGN TOOL.

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
    console.log(PUTER_ELEMENTS_SYSTEM_PROMPT, userPrompt);
    return generateLayout(apiKey, userPrompt, currentElements, canvasWidth, canvasHeight, PUTER_ELEMENTS_SYSTEM_PROMPT, options);
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

    const PUTER_ELEMENTS_SYSTEM_PROMPT = `You are a strict output-only assistant for a CANVAS design tool. When asked to generate layout elements, you MUST respond using ONE of the following formats ONLY (no extra text, no explanation):
- Create a relative div with absolute divs inside
- Don't use nested divs in absolute divs
- Don't include html, body, or head tags
- all elements must be absolutely positioned inside a single relative div
- add id attributes to each absolute div for element identification
- Play with coordinates using left, right, top, bottom properties
- Can apply shadows, effects, gradients
- Can use text
- SVG(should be centered in div and scaled to fit inside the div properly), single div (as design element), or 
- image (base64 in src) inside absolute divs
- Size: ${canvasWidth}x${canvasHeight}px (exactly this canvas size)
- Focus on visual impact, readability, and engagement
- Use modern design principles: contrast, hierarchy, whitespace
- create visually appealing layouts for marketing banners, social media posts, ads, etc.
- add shapes, icons, images to enhance the design
- dont't use flex/container layout or children nesting.
- Coordinates are in PIXELS (top-left origin). All elements MUST fit within the canvas.
- When updating, reference existing elements ONLY by the provided ids.

Critical constraints (must follow):
-HTML structure for the design (no explanations, no code blocks). The HTML should be a single div with position: relative containing absolutely positioned child elements.
- dont use nested divs in absolute divs.
- seprarate images and svgs into their own divs, text, don't use span or other tags create each element separately.
- If modifying existing design, preserve elements and improve based on the request.
- This tool is ABSOLUTE-POSITION CANVAS. Do NOT use flex/container layout or children nesting.
- Coordinates are in PIXELS (top-left origin). All elements MUST fit within the canvas.
- When updating, reference existing elements ONLY by the provided ids.

Current HTML layout (modify this if it exists, or create new if empty):
${currentHtml}

User request: ${userPrompt}

H
Current HTML layout (modify this if it exists, or create new if empty):
${currentHtml}

User request: ${userPrompt} Return ONLY the complete HTML structure for the design (no explanations, no code blocks). The HTML should be a single div with position: relative containing absolutely positioned child elements. If modifying existing design, preserve good elements and improve based on the request.TML should be a single div with position: relative containing absolutely positioned child elements. If modifying existing design, preserve good elements and improve based on the request.`;

    // Determine model from localStorage (UI stores this in settings when enabling Puter)
    const model = (typeof window !== 'undefined' && localStorage.getItem('puter_model')) || 'claude-sonnet-4-5';

    const baseInstructions = strategy === 'schema' ? ACTIONS_PROVIDER_SYSTEM_PROMPT : systemPrompt;
    const promptBody = `${PUTER_ELEMENTS_SYSTEM_PROMPT}\n\nCanvas: ${canvasWidth}x${canvasHeight}\nExisting element summary: ${JSON.stringify(
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
          const domParsed = parseAbsoluteHtmlToTemplateElements(parsedHtml, canvasWidth, canvasHeight);
          if (domParsed.length > 0) return domParsed;
        }
      } catch (e) {
        console.warn('Failed to parse Puter HTML output:', e?.message ?? e);
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
    const apiKey = this.config.groqApiKey || "";

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
          model: "mixtral-8x7b-32768",
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
    const DESIGN_SYSTEM_PROMPT = `You are a professional graphic designer. Create stunning visual designs for various purposes.

RULES FOR CREATION:
- Create a relative div with absolute divs inside
- Don't use multi-nested divs in absolute divs
- Don't include html, body, or head tags
- Play with coordinates using left, right, top, bottom properties
- Can apply shadows, effects, gradients
- Can use text, SVG(should be centered in div and scaled to fit inside the div properly), single div (as design element), or image (base64 in src) inside absolute divs
- Size: ${canvasWidth}x${canvasHeight}px (exactly this canvas size)
- Focus on visual impact, readability, and engagement
- Use modern design principles: contrast, hierarchy, whitespace

Current HTML layout (modify this if it exists, or create new if empty):
${currentHtml}

User request: ${userPrompt}

Return ONLY the complete HTML structure for the design (no explanations, no code blocks). The HTML should be a single div with position: relative containing absolutely positioned child elements. If modifying existing design, preserve good elements and improve based on the request.`;

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
