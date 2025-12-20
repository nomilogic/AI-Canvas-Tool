# Detailed Changes to gemini.ts

## Change 1: System Prompt - Added Full-Width/Height Examples

**Location**: Lines 118-135 in `client/src/lib/gemini.ts`

**What Changed**:
Added explicit examples and math formulas to help AI understand how to create full-size elements.

**Before**:
```
Rules of thumb for "website" layouts on a canvas:
- Use a background rectangle for sections.
- Place children with consistent padding (e.g. 40px) and spacing (e.g. 12-24px).
- Use alignment by computing x/y values (do NOT use containers).
```

**After**:
```
Rules of thumb for "website" layouts on a canvas:
- Use a background rectangle for sections.
- Place children with consistent padding (e.g. 40px) and spacing (e.g. 12-24px).
- Use alignment by computing x/y values (do NOT use containers).

EXAMPLES - FOR FULL-WIDTH/FULL-HEIGHT ELEMENTS:
- For a full-width bar at the top: { type: "shape", shape: "rectangle", x: 0, y: 0, width: canvas_width, height: 60, color: "#..." }
- For a full-width bar at the bottom: { type: "shape", shape: "rectangle", x: 0, y: canvas_height-60, width: canvas_width, height: 60, color: "#..." }
- For a full-height sidebar: { type: "shape", shape: "rectangle", x: 0, y: 0, width: 200, height: canvas_height, color: "#..." }
- Key: For full-width, always use width = canvas_width, and x = 0. For full-height, always use height = canvas_height, and y = 0.

CRITICAL MATH FOR SIZING:
- If canvas is 800x600:
  - Full-width element: x=0, y=any, width=800, height=any (NO MORE, NO LESS)
  - Full-height element: x=any, y=0, width=any, height=600 (NO MORE, NO LESS)
  - Bottom-aligned bar: y = 600-height (e.g., 60px tall bar: y=540)
  - RIGHT-aligned element: x = 800-width
```

**Why**: Gives the AI concrete examples with actual canvas dimensions to reference.

---

## Change 2: Context Generation - Explicit Canvas Example

**Location**: Lines 206-222 in `client/src/lib/gemini.ts`

**What Changed**:
Enhanced the context sent to AI with specific examples and a warning about full-width/height.

**Before**:
```typescript
const context = `
CANVAS DIMENSIONS (STRICT - ALL ELEMENTS MUST FIT):
- width: ${canvasWidth} pixels
- height: ${canvasHeight} pixels
- Valid x range: 0 to ${canvasWidth} (element's right edge = x + width must be <= ${canvasWidth})
- Valid y range: 0 to ${canvasHeight} (element's bottom edge = y + height must be <= ${canvasHeight})

IMPORTANT: When generating elements:
- Never output x < 0, y < 0, x+width > ${canvasWidth}, or y+height > ${canvasHeight}
- If an element would exceed these bounds, reduce size or reposition it to fit

CURRENT JSON STATE:
${JSON.stringify(currentElements, null, 2)}

USER COMMAND:
"${prompt}"

Return the fully updated JSON array of TemplateElement objects (ensuring ALL elements fit within canvas):
`;
```

**After**:
```typescript
const context = `
CANVAS DIMENSIONS (STRICT - ALL ELEMENTS MUST FIT):
- width: ${canvasWidth} pixels
- height: ${canvasHeight} pixels
- Valid x range: 0 to ${canvasWidth} (element's right edge = x + width must be <= ${canvasWidth})
- Valid y range: 0 to ${canvasHeight} (element's bottom edge = y + height must be <= ${canvasHeight})

IMPORTANT: When generating elements:
- Never output x < 0, y < 0, x+width > ${canvasWidth}, or y+height > ${canvasHeight}
- If user asks for "full width" or "full height", use EXACTLY canvas_width (${canvasWidth}) or canvas_height (${canvasHeight})
- Do NOT reduce full-width/full-height elements. They should span the ENTIRE dimension.
- Example: For canvas ${canvasWidth}x${canvasHeight}, "full-width bar on top" should be: {x:0, y:0, width:${canvasWidth}, height:60}

CURRENT JSON STATE:
${JSON.stringify(currentElements, null, 2)}

USER COMMAND:
"${prompt}"

Return the fully updated JSON array of TemplateElement objects (ensuring ALL elements fit within canvas):
`;
```

**Why**: 
- Dynamically shows actual canvas dimensions (e.g., "canvas_width (800)" instead of just "canvas_width")
- Includes a concrete example with the actual canvas size
- Explicitly warns against reducing full-width/height elements

---

## Change 3: Repair Prompt - Full-Width Guidance

**Location**: Lines 241-248 in `client/src/lib/gemini.ts`

**What Changed**:
Enhanced the repair context (used when AI outputs invalid schema) with explicit full-width/height guidance.

**Before**:
```typescript
const repairContext = `
CANVAS DIMENSIONS (STRICT - ALL ELEMENTS MUST FIT):
- width: ${canvasWidth} pixels
- height: ${canvasHeight} pixels
- Valid bounds: x >= 0, y >= 0, x+width <= ${canvasWidth}, y+height <= ${canvasHeight}

IMPORTANT: Ensure all repaired elements fit within these bounds. Reduce sizes or reposition if needed.

BAD_JSON (rewrite this to valid TemplateElement[] with proper bounds):
${JSON.stringify(raw, null, 2)}
`;
```

**After**:
```typescript
const repairContext = `
CANVAS DIMENSIONS (STRICT - ALL ELEMENTS MUST FIT):
- width: ${canvasWidth} pixels
- height: ${canvasHeight} pixels
- Valid bounds: x >= 0, y >= 0, x+width <= ${canvasWidth}, y+height <= ${canvasHeight}

IMPORTANT: 
- Ensure all repaired elements fit within these bounds. Reduce sizes or reposition if needed.
- For full-width elements, use width = ${canvasWidth} (not less)
- For full-height elements, use height = ${canvasHeight} (not less)

BAD_JSON (rewrite this to valid TemplateElement[] with proper bounds):
${JSON.stringify(raw, null, 2)}
`;
```

**Why**: When AI needs to repair output, this guides it to maintain full-width/height intent.

---

## Impact Summary

### Before Fix
- User says: "Create a full size bar on top"
- AI might output: `{x:0, y:0, width:400, height:60}` ❌ (Half the canvas width)

### After Fix
- User says: "Create a full size bar on top"
- AI should output: `{x:0, y:0, width:800, height:60}` ✅ (Full canvas width)

### Key Improvements
1. **Explicit Examples**: AI sees concrete formatted JSON for full-width/height cases
2. **Math Formulas**: AI learns how to calculate positions (e.g., "y = 600-height")
3. **Numeric Context**: Canvas dimensions shown as actual numbers during generation
4. **Clear Warnings**: "NO MORE, NO LESS" emphasizes exact sizing requirements
5. **Repair Safety**: Even if first attempt is wrong, repair prompt guides correction
