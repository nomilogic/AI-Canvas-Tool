import assert from 'assert';
import { parseHtmlElementsFromText, parseJsonElementsFromText } from '../client/src/lib/template-ai';
import AIService from '../client/src/lib/ai-service';

// Provide a minimal localStorage shim when running in Node for tests
if (typeof localStorage === 'undefined') {
  (globalThis as any).localStorage = (() => {
    const store = new Map<string, string>();
    return {
      getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
      setItem: (k: string, v: string) => store.set(k, String(v)),
      removeItem: (k: string) => store.delete(k),
    } as Storage;
  })();
}

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

// 5) Ensure AIService handles OpenAI/DeepSeek provider selections by throwing when key is missing
(async () => {
  const svcOpen = new AIService({ provider: 'openai' as any });
  let threw = false;
  try {
    await svcOpen.generateLayout('Test prompt', [], 800, 600);
  } catch (e) {
    threw = true;
  }
  assert(threw, 'OpenAI provider without key should throw');

  // DeepSeek uses server-side proxy; the server requires DEEPSEEK_API_KEY to be configured.
  const svcDeep = new AIService({ provider: 'deepseek' as any });
  threw = false;
  try {
    await svcDeep.generateLayout('Test prompt', [], 800, 600);
  } catch (e) {
    threw = true;
  }
  assert(threw, 'DeepSeek should throw when server proxy is not configured with API key');

  console.log('AIService provider key checks passed ✅');
})();

  // 6) Ensure setStoredProviderKey dispatches a global change event so UI can sync
  // 6) Ensure setStoredProviderKey dispatches a global change event so UI can sync
  {
    let fired = false;
    const handler = () => { fired = true; };

    // Call the helper (use dynamic import to work in ESM)
    const mod = await import('../client/src/lib/ai-config');

    try {
      mod.aiConfigEvents.addEventListener('ai-config-changed', handler as EventListener);
    } catch (e) {
      // fallback: try listening on window if available
      if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.addEventListener('ai-config-changed', handler as EventListener);
      }
    }

    // Trigger
    mod.setStoredProviderKey('gemini', 'test-key-123');

    // Remove the test key
    mod.setStoredProviderKey('gemini', '');

    // cleanup
    try { mod.aiConfigEvents.removeEventListener('ai-config-changed', handler as EventListener); } catch (e) {}
    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
      window.removeEventListener('ai-config-changed', handler as EventListener);
    }

    assert(fired, 'setStoredProviderKey should fire ai-config-changed event');
    console.log('ai-config change event dispatch verified ✅');
  }

  // 7) parsePromptToParts should detect data URIs and split into inlineData parts
  {
    const { parsePromptToParts } = await import('../client/src/lib/gemini');
    const sample = 'Here is an uploaded image: ![img](data:image/png;base64,AAAA) and then more text';
    const parts = parsePromptToParts(sample);
    const hasInline = parts.some((p: any) => p && p.inlineData && p.inlineData.mimeType === 'image/png');
    console.assert(hasInline, 'parsePromptToParts should extract inlineData for data URI');
    console.log('parsePromptToParts data URI parsing verified ✅');
  }
