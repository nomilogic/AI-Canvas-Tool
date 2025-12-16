import { GoogleGenerativeAI } from "@google/generative-ai";

export type CanvasElement = {
  id: string;
  type: 'rect' | 'circle' | 'text' | 'image';
  x: number;
  y: number;
  width?: number;
  height?: number;
  radius?: number;
  fill?: string;
  text?: string;
  fontSize?: number;
  rotation?: number;
  opacity?: number;
};

const SYSTEM_PROMPT = `
You are an intelligent Layout Engine for a design tool. 
Your goal is to manipulate the JSON state of a canvas based on user commands.

INPUTS:
1. Current State (JSON Array of elements)
2. User Command (Natural Language)

OUTPUT:
- You must return the COMPLETE NEW JSON STATE (Array of objects).
- Do not just return new items. Return the entire list of elements as they should appear after the command.
- If the user wants to ADD, append to the list.
- If the user wants to MODIFY (e.g., "move left", "change color"), find the relevant item and update it in the list.
- If the user wants to DELETE, remove it from the list.
- Do not wrap in markdown code blocks. Return raw JSON.

JSON SCHEMA:
type CanvasElement = {
  id: string; // preserve IDs when modifying! generate new random IDs for new items.
  type: 'rect' | 'circle' | 'text' | 'image';
  x: number; // 0-800
  y: number; // 0-600
  width?: number; 
  height?: number; 
  radius?: number; 
  fill?: string; 
  text?: string; 
  fontSize?: number;
};

CONTEXT:
- Canvas size: 800x600.
- Center: 400,300.

EXAMPLES:

Scenario 1: Add
Current: []
User: "Add a red box in the center"
Output: [{"id":"a1","type":"rect","x":350,"y":250,"width":100,"height":100,"fill":"#ef4444"}]

Scenario 2: Modify (Preserve ID)
Current: [{"id":"a1","type":"rect","x":350,"y":250,"width":100,"height":100,"fill":"#ef4444"}]
User: "Move it to the top left and make it blue"
Output: [{"id":"a1","type":"rect","x":20,"y":20,"width":100,"height":100,"fill":"#3b82f6"}]

Scenario 3: Complex Creation
Current: []
User: "Create a blog post card layout"
Output: [
  {"id":"b1","type":"rect","x":200,"y":100,"width":400,"height":500,"fill":"#1e293b"}, 
  {"id":"b2","type":"rect","x":220,"y":120,"width":360,"height":200,"fill":"#334155"},
  {"id":"b3","type":"text","x":220,"y":340,"text":"Blog Title Here","fontSize":24,"fill":"white"},
  {"id":"b4","type":"text","x":220,"y":380,"text":"Lorem ipsum dolor sit amet...","fontSize":14,"fill":"#94a3b8"}
]

Scenario 4: Delete
Current: [{"id":"c1","type":"circle","x":100,"y":100,"radius":50,"fill":"red"}]
User: "Delete the circle"
Output: []
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
    
    // Clean up potential markdown code blocks
    const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    return JSON.parse(cleanJson);
  } catch (error) {
    console.error("AI Generation failed:", error);
    throw error;
  }
}
