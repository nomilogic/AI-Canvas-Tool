import assert from 'assert';
import { elementsToHtml, updateHtmlRawStyle } from '../client/src/lib/layout-html';

const bg = {
  id: 'bg-1',
  name: 'Background',
  type: 'shape',
  x: 0,
  y: 0,
  width: 1280,
  height: 720,
  zIndex: 0,
  color: '#0f172a',
} as any;

const title = {
  id: 't-1',
  name: 'Title',
  type: 'text',
  x: 290,
  y: 270,
  width: 700,
  height: 96,
  zIndex: 1,
  content: 'Happy New Year',
  fontSize: 80,
  fontFamily: 'Garamond',
  color: '#fde68a',
} as any;

const dot = {
  id: 'd-1',
  name: 'Dot',
  type: 'shape',
  x: 850,
  y: 100,
  width: 12,
  height: 12,
  zIndex: 2,
  color: '#ffffff',
  shape: 'circle',
} as any;

const html = elementsToHtml([bg, title, dot], { width: 1280, height: 720 });
console.log('generated html:\n', html);

// Root should have data-el-id set to bg id and background color from bg
assert(html.includes('data-el-id="bg-1"'), 'root should expose background id');
assert(/background:\s*#0f172a/i.test(html), 'root should include background color');
assert(!/data-el-id="bg-1"[^>]*>.*<div/.test(html), 'background element should not be rendered twice');

// Update raw style on background (root) and verify it takes effect
const updated = updateHtmlRawStyle(html, 'bg-1', 'position:relative;width:1280px;height:720px;background:#123456');
console.log('updated html:\n', updated);
assert(/background:\s*#123456/i.test(updated), 'updateHtmlRawStyle should update root style');

// Test gradient serialization
bg.gradient = {
  enabled: true,
  type: 'linear',
  rotation: 45,
  stops: [ { offset: 0, color: '#00ff00' }, { offset: 1, color: '#0000ff' } ]
};
const ghtml = elementsToHtml([bg, title, dot], { width: 1280, height: 720 });
assert(/linear-gradient\(/i.test(ghtml), 'gradient should serialize to linear-gradient');

console.log('All layers assertions passed ✅');
