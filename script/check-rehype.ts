import rehypeParse from 'rehype-parse';
import { unified } from 'unified';

console.log('rehypeParse:', typeof rehypeParse, Object.keys(rehypeParse));
console.log('rehypeParse.default present?', (rehypeParse as any)?.default !== undefined);

const plugin = (rehypeParse as any)?.default ?? rehypeParse;
console.log('plugin type:', typeof plugin, 'name:', plugin && plugin.name);

try {
  const p = unified().use(plugin, { fragment: true });
  console.log('processor created');
  const tree = p.parse('<div>hello</div>');
  console.log('parse result type:', tree && tree.type, 'children length:', tree && tree.children && tree.children.length);
} catch (err) {
  console.error('parse error:', err);
}
