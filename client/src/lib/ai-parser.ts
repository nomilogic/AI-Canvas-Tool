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

// Enhanced heuristic parser
export function parsePromptToElement(prompt: string, canvasWidth: number, canvasHeight: number): CanvasElement | null {
  const p = prompt.toLowerCase();
  
  // 1. Detect Type
  let type: CanvasElement['type'] = 'rect';
  if (p.includes('circle') || p.includes('ball') || p.includes('dot')) type = 'circle';
  else if (p.includes('text') || p.includes('label') || p.includes('write') || p.includes('say')) type = 'text';
  else if (p.includes('image') || p.includes('picture') || p.includes('photo')) type = 'image';

  // 2. Detect Color (More robust)
  let fill = '#3b82f6'; // Default blue
  
  const colors: Record<string, string> = {
    'dark blue': '#1e3a8a',
    'light blue': '#93c5fd',
    'navy': '#000080',
    'blue': '#3b82f6',
    
    'dark red': '#7f1d1d',
    'light red': '#fca5a5',
    'crimson': '#dc143c',
    'red': '#ef4444',
    
    'dark green': '#14532d',
    'light green': '#86efac',
    'lime': '#84cc16',
    'green': '#22c55e',
    
    'yellow': '#eab308',
    'gold': '#ffd700',
    'orange': '#f97316',
    'purple': '#a855f7',
    'violet': '#8b5cf6',
    'pink': '#ec4899',
    'black': '#000000',
    'white': '#ffffff',
    'gray': '#6b7280',
    'grey': '#6b7280',
    'dark': '#1e293b',
  };

  // Check for multi-word colors first
  let colorFound = false;
  for (const [name, hex] of Object.entries(colors)) {
    if (p.includes(name)) {
      fill = hex;
      colorFound = true;
      break; 
    }
  }

  // Check for hex codes
  const hexMatch = p.match(/#[0-9a-f]{3,6}/);
  if (hexMatch) {
    fill = hexMatch[0];
  }

  // 3. Detect Dimensions
  const widthMatch = p.match(/(\d+)\s*(?:width|w|px width|px w)/);
  const heightMatch = p.match(/(\d+)\s*(?:height|h|px height|px h)/);
  const sizeMatch = p.match(/(\d+)\s*(?:size|px|x\d+)/); // Matches "200px" or "100x100" logic if we parsed differently, but simple "200px" works here

  let width = widthMatch ? parseInt(widthMatch[1]) : (type === 'text' ? undefined : 100);
  let height = heightMatch ? parseInt(heightMatch[1]) : (type === 'text' ? undefined : 100);
  let radius = sizeMatch ? parseInt(sizeMatch[1]) / 2 : 50;
  
  // Fallback for square dimensions if only one size is given for a rect
  if (sizeMatch && !widthMatch && !heightMatch && type === 'rect') {
     const s = parseInt(sizeMatch[1]);
     width = s;
     height = s;
  }

  // 4. Detect Position
  let x = canvasWidth / 2 - (width || 0) / 2;
  let y = canvasHeight / 2 - (height || 0) / 2;

  // Keyword positioning
  if (p.includes('top left')) { x = 40; y = 40; }
  else if (p.includes('top right')) { x = canvasWidth - (width || 100) - 40; y = 40; }
  else if (p.includes('bottom left')) { x = 40; y = canvasHeight - (height || 100) - 40; }
  else if (p.includes('bottom right')) { x = canvasWidth - (width || 100) - 40; y = canvasHeight - (height || 100) - 40; }
  else if (p.includes('center')) { x = canvasWidth / 2 - (width || 0) / 2; y = canvasHeight / 2 - (height || 0) / 2; }
  
  // Coordinate positioning (e.g., "at 100, 200")
  const coordsMatch = p.match(/at\s+(\d+)[,\s]+(\d+)/);
  if (coordsMatch) {
    x = parseInt(coordsMatch[1]);
    y = parseInt(coordsMatch[2]);
  }

  // 5. Detect Text Content
  let text = "Hello AI";
  const textMatch = p.match(/(?:text|saying|write|content)\s+["']([^"']+)["']/) || p.match(/["']([^"']+)["']/);
  if (type === 'text' && textMatch) {
    text = textMatch[1];
  } else if (type === 'text') {
    // If no quotes, try to grab everything after the command
    const commandWords = ['write', 'text', 'say'];
    for (const word of commandWords) {
        const idx = p.indexOf(word);
        if (idx !== -1) {
            const potentialText = prompt.slice(idx + word.length).trim();
            if (potentialText && !potentialText.includes('blue') && !potentialText.includes('at ')) {
                 // Very naive fallback, usually better to force quotes
                 text = potentialText; 
            }
        }
    }
  }

  const id = Math.random().toString(36).substr(2, 9);

  if (type === 'text') {
    return { id, type, x, y, text, fontSize: 24, fill };
  } else if (type === 'circle') {
    return { id, type, x, y, radius, fill, width: radius * 2, height: radius * 2 };
  } else {
    return { id, type, x, y, width: width || 100, height: height || 100, fill };
  }
}
