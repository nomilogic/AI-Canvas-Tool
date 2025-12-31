import { parseHtmlElementsFromText } from '../client/src/lib/template-ai';

const sample = `
<div style="position:relative;width:1280px;height:720px;background:#0f172a;">
  <div style="position:absolute;left:290px;top:270px;width:700px;height:96px;color:#fde68a;font-size:80px;font-family:Garamond, serif;font-weight:700;display:flex;align-items:center;justify-content:center;text-align:center;">
    Happy New Year
  </div>
  <div style="position:absolute;left:490px;top:380px;width:300px;height:120px;color:#ffffff;font-size:120px;font-family:Arial, sans-serif;font-weight:900;display:flex;align-items:center;justify-content:center;text-align:center;">
    2026
  </div>
  <svg viewBox="0 0 24 24" style="position:absolute;left:150px;top:120px;width:100px;height:100px;">
    <path d="M12 2 L12 5 M12 19 L12 22 M2 12 L5 12 M19 12 L22 12 M4.2 4.2 L6.3 6.3 M17.7 17.7 L19.8 19.8 M4.2 19.8 L6.3 17.7 M17.7 6.3 L19.8 4.2" stroke="#fde68a" stroke-width="1.5" stroke-linecap="round" />
  </svg>
  <svg viewBox="0 0 24 24" style="position:absolute;left:1000px;top:180px;width:80px;height:80px;">
    <path d="M12 2 L12 5 M12 19 L12 22 M2 12 L5 12 M19 12 L22 12 M4.2 4.2 L6.3 6.3 M17.7 17.7 L19.8 19.8 M4.2 19.8 L6.3 17.7 M17.7 6.3 L19.8 4.2" stroke="#fde68a" stroke-width="1.5" stroke-linecap="round" />
  </svg>
  <svg viewBox="0 0 24 24" style="position:absolute;left:1050px;top:550px;width:120px;height:120px;">
    <path d="M12 2 L12 5 M12 19 L12 22 M2 12 L5 12 M19 12 L22 12 M4.2 4.2 L6.3 6.3 M17.7 17.7 L19.8 19.8 M4.2 19.8 L6.3 17.7 M17.7 6.3 L19.8 4.2" stroke="#fde68a" stroke-width="1.5" stroke-linecap="round" />
  </svg>
  <svg viewBox="0 0 24 24" style="position:absolute;left:200px;top:500px;width:60px;height:60px;">
    <path d="M12 2 L12 5 M12 19 L12 22 M2 12 L5 12 M19 12 L22 12 M4.2 4.2 L6.3 6.3 M17.7 17.7 L19.8 19.8 M4.2 19.8 L6.3 17.7 M17.7 6.3 L19.8 4.2" stroke="#fde68a" stroke-width="1.5" stroke-linecap="round" />
  </svg>
  <div style="position:absolute;left:850px;top:100px;width:12px;height:12px;background:#ffffff;border-radius:9999px;"></div>
  <div style="position:absolute;left:400px;top:180px;width:8px;height:8px;background:#ffffff;border-radius:9999px;"></div>
  <div style="position:absolute;left:1100px;top:400px;width:10px;height:10px;background:#ffffff;border-radius:9999px;"></div>
  <div style="position:absolute;left:150px;top:350px;width:10px;height:10px;background:#fde68a;border-radius:9999px;"></div>
  <div style="position:absolute;left:900px;top:620px;width:14px;height:14px;background:#fde68a;border-radius:9999px;"></div>
  <div style="position:absolute;left:500px;top:580px;width:9px;height:9px;background:#ffffff;border-radius:9999px;"></div>
  <div style="position:absolute;left:80px;top:80px;width:8px;height:8px;background:#fde68a;border-radius:9999px;"></div>
</div>
`;

import assert from 'assert';

const out = parseHtmlElementsFromText(sample, 800, 600);

// Basic assertions to validate parser -> editor compatibility
// 1) Background color
const bg = out.find((e) => e.type === 'shape' && (e as any).color === '#0f172a');
assert(bg, 'background with color #0f172a should be present');

// 2) Text elements for headline and year
const title = out.find((e) => e.type === 'text' && (e as any).content?.includes('Happy New Year')) as any;
const year = out.find((e) => e.type === 'text' && (e as any).content?.includes('2026')) as any;
assert(title, 'title text "Happy New Year" should be parsed');
assert(year, 'year text "2026" should be parsed');
if (title) {
  assert(title.fontFamily && title.fontFamily.toLowerCase().includes('garamond'), 'title should keep Garamond font');
  assert(Math.abs(title.fontSize - 80) <= 8, `title fontSize should be about 80px (got ${title.fontSize})`);
}
if (year) {
  assert(year.fontFamily && year.fontFamily.toLowerCase().includes('arial'), 'year should keep Arial font');
  assert(Math.abs(year.fontSize - 120) <= 12, `year fontSize should be about 120px (got ${year.fontSize})`);
}

// 3) SVG stroke and strokeWidth
const svgs = out.filter((e) => e.type === 'svg') as any[];
assert(svgs.length >= 1, 'expected at least one svg element');
svgs.forEach((s) => {
  assert(s.stroke === '#fde68a', `svg stroke should be #fde68a (got ${s.stroke})`);
  assert(Math.abs((s.strokeWidth ?? 0) - 1.5) < 0.1, `svg strokeWidth should be ~1.5 (got ${s.strokeWidth})`);
});

// 4) Circle dots detection
const dots = out.filter((e) => e.type === 'shape' && e.shape === 'circle');
assert(dots.length >= 1, 'expected at least one small circular dot shape');

console.log('All parse assertions passed ✅');
