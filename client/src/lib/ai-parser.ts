export type CanvasElement = {
  id: string;
  type: 'rect' | 'circle' | 'text' | 'image' | 'container';
  x?: number;
  y?: number;
  width?: number | string; // Support "100%" or 100
  height?: number | string;
  radius?: number;
  fill?: string;
  text?: string;
  fontSize?: number;
  rotation?: number;
  opacity?: number;
  
  // HTML/Flex Specifics
  layout?: 'flex' | 'absolute';
  direction?: 'row' | 'column';
  gap?: number;
  align?: 'start' | 'center' | 'end';
  justify?: 'start' | 'center' | 'end' | 'between';
  padding?: number;
  children?: CanvasElement[]; // Nested elements
};

// ... (Rest of parser logic would need to be updated, but for now we focus on the Type definition)

// Enhanced heuristic parser (kept simple for fallback, mostly relying on AI now)
export function parsePromptToElement(prompt: string, canvasWidth: number, canvasHeight: number): CanvasElement | null {
  // ... (Existing logic, simplified for brevity as we rely on Gemini)
  return {
    id: Math.random().toString(36).substr(2, 9),
    type: 'rect',
    x: 100, 
    y: 100,
    width: 100,
    height: 100,
    fill: '#3b82f6'
  };
}
