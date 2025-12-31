import assert from 'assert';
import { parseHtmlElementsFromText, parseJsonElementsFromText } from '../client/src/lib/template-ai';

console.log('Running provider integration tests...');

// 1) Puter-style HTML (code fence)
const puterHtml = '```html\n' +
  '<div style="position:relative;width:1280px;height:720px;background:#0f172a;">' +
  '<div style="position:absolute;left:290px;top:270px;width:700px;height:96px;color:#fde68a;font-size:80px;font-family:Garamond, serif;font-weight:700;display:flex;align-items:center;justify-content:center;text-align:center;">Happy New Year</div>' +
  '<div style="position:absolute;left:490px;top:380px;width:300px;height:120px;color:#ffffff;font-size:120px;font-family:Arial, sans-serif;font-weight:900;display:flex;align-items:center;justify-content:center;text-align:center;">2026</div>' +
  '<svg viewBox="0 0 24 24" style="position:absolute;left:150px;top:120px;width:100px;height:100px;"><path d="M0" stroke="#fde68a" stroke-width="1.5" /></svg>' +
  '</div>\n' +
  '```';

const parsedPuter = parseHtmlElementsFromText(puterHtml, 1280, 720);
assert(parsedPuter.length > 0, 'Puter HTML should parse into elements');
assert(parsedPuter.some((e) => e.type === 'shape' && (e as any).color === '#0f172a'), 'Puter background detected');
assert(parsedPuter.some((e) => e.type === 'text' && (e as any).content?.includes('Happy New Year')), 'Puter headline detected');
assert(parsedPuter.some((e) => e.type === 'svg' && (e as any).stroke === '#fde68a'), 'Puter svg stroke detected');

// 2) Gemini-style raw HTML
const geminiHtml = `
<div style="position:relative;width:800px;height:600px;background:#ffffff;">
  <div style="position:absolute;left:40px;top:40px;width:240px;height:80px;background:#111827;border-radius:16px;"></div>
  <div style="position:absolute;left:56px;top:56px;width:208px;height:48px;color:#ffffff;font-size:20px;font-family:Inter;font-weight:600;display:flex;align-items:center;justify-content:center;text-align:center;">Hero Title</div>
  <svg viewBox="0 0 24 24" style="position:absolute;left:640px;top:136px;width:40px;height:40px;"><path d="M0" fill="#ffffff" /></svg>
</div>
`;
const parsedGemini = parseHtmlElementsFromText(geminiHtml, 800, 600);
assert(parsedGemini.some((e) => e.type === 'shape' && (e as any).color === '#111827'), 'Gemini shape background detected');
assert(parsedGemini.some((e) => e.type === 'text' && (e as any).content?.includes('Hero Title')), 'Gemini text detected');
assert(parsedGemini.some((e) => e.type === 'svg' && (e as any).fill === '#ffffff'), 'Gemini svg fill detected');

// 3) Puter-style JSON output (snake_case, box / rect)
const puterJson = `
[{
  "type": "box",
  "id": "bg",
  "left": 0,
  "top": 0,
  "width": "100%",
  "height": "100%",
  "background": "#0f172a"
}]
`;
const parsedJson = parseJsonElementsFromText(puterJson, 1280, 720);
assert(parsedJson.length > 0, 'Puter JSON should parse');
assert(parsedJson.some((e) => e.type === 'shape' && (e as any).color === '#0f172a'), 'Puter JSON background detected');

// 4) Mixed JSON with elements wrapper
const wrapped = `
{ "elements": [ { "type": "text", "content": "Wrap Test", "x": 10, "y": 10, "width": 200, "height": 40 } ] }
`;
const parsedWrapped = parseJsonElementsFromText(wrapped, 800, 600);
assert(parsedWrapped.some((e) => e.type === 'text' && (e as any).content?.includes('Wrap Test')), 'Wrapped JSON parsed text');

console.log('All provider integration assertions passed ✅');
