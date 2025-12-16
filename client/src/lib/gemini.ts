import { GoogleGenerativeAI } from "@google/generative-ai";
import { CanvasElement } from "./ai-parser";

const SYSTEM_PROMPT = `
You are an intelligent UI Engine.
Your goal is to manipulate the JSON state of a design tool based on user commands.

INPUTS:
1. Current State (JSON Array of elements)
2. User Command (Natural Language)

OUTPUT:
- Return the COMPLETE NEW JSON STATE (Array of objects).
- Raw JSON only. No markdown.

JSON SCHEMA:
type CanvasElement = {
  id: string; 
  type: 'rect' | 'circle' | 'text' | 'image' | 'container';
  
  // Positioning
  layout?: 'absolute' | 'flex'; // Default absolute for canvas-like, flex for layouts
  x?: number; 
  y?: number; 
  width?: number | string; // numbers are pixels, strings like "100%" allowed for flex
  height?: number | string; 
  
  // Style
  fill?: string; // Background color or text color
  radius?: number; 
  fontSize?: number;
  text?: string; 
  opacity?: number;

  // Flex Container Props (Only if type='container')
  direction?: 'row' | 'column';
  gap?: number;
  align?: 'start' | 'center' | 'end';
  justify?: 'start' | 'center' | 'end' | 'between';
  padding?: number;
  
  // Nesting
  children?: CanvasElement[];
};

SCENARIO EXAMPLES:

1. "Create a red box" -> Absolute positioning default
[{"id":"a1","type":"rect","layout":"absolute","x":100,"y":100,"width":100,"height":100,"fill":"red"}]

2. "Create a navbar with logo and links" -> Flex container
[
  {
    "id":"nav", "type":"container", "layout":"absolute", "x":0, "y":0, "width":"100%", "height":60, "fill":"#1e293b",
    "display":"flex", "direction":"row", "align":"center", "justify":"between", "padding":20,
    "children": [
       {"id":"logo", "type":"text", "text":"MyBrand", "fill":"white", "fontSize":20},
       {"id":"links", "type":"container", "layout":"flex", "gap":20, "direction":"row", "children": [
          {"id":"l1", "type":"text", "text":"Home", "fill":"#cbd5e1"},
          {"id":"l2", "type":"text", "text":"About", "fill":"#cbd5e1"}
       ]}
    ]
  }
]

3. "Create a 3-column feature section" -> Grid-like Flex
[
  {
    "id":"section", "type":"container", "layout":"absolute", "x":0, "y":100, "width":"100%", "height":400, "fill":"white",
    "display":"flex", "direction":"column", "align":"center", "justify":"center", "gap":40,
    "children": [
       {"id":"h1", "type":"text", "text":"Our Features", "fontSize":32, "fill":"#0f172a"},
       {
         "id":"grid", "type":"container", "layout":"flex", "direction":"row", "gap":20, "align":"start", "justify":"center",
         "children": [
           {"id":"c1", "type":"container", "layout":"flex", "direction":"column", "padding":20, "fill":"#f1f5f9", "width":200, "height":200, "radius":8, "children": [
              {"id":"t1", "type":"text", "text":"Fast", "fontSize":18, "fill":"#334155"},
              {"id":"d1", "type":"text", "text":"We are super fast.", "fontSize":14, "fill":"#64748b"}
           ]},
           {"id":"c2", "type":"container", "layout":"flex", "direction":"column", "padding":20, "fill":"#f1f5f9", "width":200, "height":200, "radius":8, "children": [
              {"id":"t2", "type":"text", "text":"Secure", "fontSize":18, "fill":"#334155"},
              {"id":"d2", "type":"text", "text":"We are super secure.", "fontSize":14, "fill":"#64748b"}
           ]},
           {"id":"c3", "type":"container", "layout":"flex", "direction":"column", "padding":20, "fill":"#f1f5f9", "width":200, "height":200, "radius":8, "children": [
              {"id":"t3", "type":"text", "text":"Scalable", "fontSize":18, "fill":"#334155"},
              {"id":"d3", "type":"text", "text":"We scale with you.", "fontSize":14, "fill":"#64748b"}
           ]}
         ]
       }
    ]
  }
]

4. "Change the navbar color to blue" -> Modify existing
(Finds the container with id='nav' or matching description and updates fill)

INSTRUCTIONS:
- For "Canvas" style requests (draw a circle), use layout: 'absolute'.
- For "Website/UI" style requests (navbar, card, grid), use layout: 'flex' and containers.
- Use '100%' width for full-width sections.
- Use nested containers for complex layouts (rows inside columns).
- Be creative with colors and spacing.
`;

export async function generateLayout(apiKey: string, prompt: string, currentElements: CanvasElement[]): Promise<CanvasElement[]> {
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const context = `
    CURRENT JSON STATE:
    ${JSON.stringify(currentElements, null, 2)}
    
    USER COMMAND:
    "${prompt}"
    
    Return the fully updated JSON array:
    `;

    const result = await model.generateContent([
      SYSTEM_PROMPT,
      context
    ]);

    const response = result.response;
    const text = response.text();
    const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    return JSON.parse(cleanJson);
  } catch (error) {
    console.error("AI Generation failed:", error);
    throw error;
  }
}
