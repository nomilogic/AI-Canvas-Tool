# Quick Fix Verification

## File Modified
✅ `client/src/lib/gemini.ts`

## Changes Made

### 1. System Prompt (Lines 118-135)
✅ Added explicit examples for full-width/height elements
✅ Added critical math formulas for sizing
✅ Example: "For a full-width bar at the top: { type: "shape", shape: "rectangle", x: 0, y: 0, width: canvas_width, height: 60, color: "#..." }"

### 2. Main Context (Lines 206-222)
✅ Enhanced with explicit instruction: "If user asks for "full width" or "full height", use EXACTLY canvas_width (${canvasWidth}) or canvas_height (${canvasHeight})"
✅ Added concrete example with actual canvas dimensions
✅ Warning: "Do NOT reduce full-width/full-height elements"

### 3. Repair Prompt (Lines 241-248)
✅ Added reminder: "For full-width elements, use width = ${canvasWidth} (not less)"
✅ Added reminder: "For full-height elements, use height = ${canvasHeight} (not less)"

## Test Commands

After rebuilding, test with these commands:

1. **"Create a full size bar on top"**
   Expected: Element with x=0, y=0, width=800, height=60

2. **"Create a footer bar full width at bottom"**
   Expected: Element with x=0, y=540, width=800, height=60

3. **"Add a left sidebar full height"**
   Expected: Element with x=0, y=0, width=200, height=600

## Validation
✅ No TypeScript errors
✅ All template literals properly formatted
✅ Canvas dimensions correctly substituted with ${canvasWidth} and ${canvasHeight}

## Why This Fix Works
- AI now sees ACTUAL canvas dimensions during generation (not just "canvas_width")
- Explicit examples show correct full-size element structure
- Math formulas show positioning logic
- Critical emphasis ("NO MORE, NO LESS") stresses exact sizing
- Repair prompt guides correction if first attempt fails

## Expected Improvement
Before: AI creates 400px wide bar (half canvas)
After: AI creates 800px wide bar (full canvas) ✅
