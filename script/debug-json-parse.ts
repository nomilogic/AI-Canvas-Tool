import { parseJsonElementsFromText } from '../client/src/lib/template-ai';

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

const parsed = parseJsonElementsFromText(puterJson, 1280, 720);
console.log('PARSED JSON:', JSON.stringify(parsed, null, 2));
// Also print intermediate cleaned extraction for diagnosis
const cleaned = puterJson.replace(/```json/gi, '').replace(/```/g, '').trim();
console.log('CLEANED:\n', cleaned);
const firstObj = cleaned.indexOf('{');
const firstArr = cleaned.indexOf('[');
const lastObjEnd = cleaned.lastIndexOf('}');
const lastArrEnd = cleaned.lastIndexOf(']');
let startIdx = -1;
let endIdx = -1;
if (firstArr !== -1 && (firstObj === -1 || firstArr < firstObj)) {
  startIdx = firstArr;
  endIdx = lastArrEnd;
} else if (firstObj !== -1) {
  startIdx = firstObj;
  endIdx = lastObjEnd;
}
console.log('startIdx, endIdx:', startIdx, endIdx);
console.log('jsonText:', cleaned.slice(startIdx, endIdx + 1));
try {
  const parsed = JSON.parse(cleaned.slice(startIdx, endIdx + 1));
  console.log('JSON.parse result:', JSON.stringify(parsed, null, 2));
} catch (err) {
  console.log('JSON.parse error:', err);
}
