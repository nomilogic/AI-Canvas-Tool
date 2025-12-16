import React from 'react';
import { CanvasElement } from '../../lib/ai-parser';
import { Button } from '@/components/ui/button';
import { Copy, Check } from 'lucide-react';
import { toast } from 'sonner';

interface CodeExporterProps {
  elements: CanvasElement[];
}

export const CodeExporter: React.FC<CodeExporterProps> = ({ elements }) => {
  const [copied, setCopied] = React.useState(false);

  const generateReactCode = (els: CanvasElement[], indentLevel = 2): string => {
    const indent = " ".repeat(indentLevel);
    
    return els.map(el => {
      // Determine tag and common classes
      let tag = 'div';
      let classes = [];
      let content = '';

      if (el.type === 'text') {
        content = el.text || '';
        classes.push('font-sans');
      }

      // Positioning
      if (el.layout === 'absolute') {
        classes.push('absolute');
        // We'd output inline styles for exact coords in a real app, 
        // or Tailwind arbitrary values like top-[100px]
      } else if (el.layout === 'flex' || el.type === 'container') {
        classes.push('flex');
        if (el.direction === 'column') classes.push('flex-col');
        if (el.align === 'center') classes.push('items-center');
        if (el.align === 'end') classes.push('items-end');
        if (el.justify === 'center') classes.push('justify-center');
        if (el.justify === 'between') classes.push('justify-between');
        if (el.justify === 'end') classes.push('justify-end');
      }

      // Styling
      if (el.type === 'circle') classes.push('rounded-full');
      else if (el.radius) classes.push('rounded-md');

      // Build style object string for dynamic values (colors, specific sizes)
      const styleProps = [];
      if (el.fill) {
         if (el.type === 'text') styleProps.push(`color: "${el.fill}"`);
         else styleProps.push(`backgroundColor: "${el.fill}"`);
      }
      if (el.width) styleProps.push(`width: "${el.width}"`);
      if (el.height) styleProps.push(`height: "${el.height}"`);
      if (el.x !== undefined && el.layout === 'absolute') styleProps.push(`left: ${el.x}`);
      if (el.y !== undefined && el.layout === 'absolute') styleProps.push(`top: ${el.y}`);
      if (el.gap) styleProps.push(`gap: ${el.gap}px`);
      if (el.padding) styleProps.push(`padding: ${el.padding}px`);
      if (el.fontSize) styleProps.push(`fontSize: ${el.fontSize}px`);

      const styleString = styleProps.length > 0 ? ` style={{${styleProps.join(', ')}}}` : '';
      const classString = classes.length > 0 ? ` className="${classes.join(' ')}"` : '';

      // Recursion
      const childrenCode = el.children ? `\n${generateReactCode(el.children, indentLevel + 2)}\n${indent}` : content;

      return `${indent}<div${classString}${styleString}>${childrenCode}</div>`;
    }).join('\n');
  };

  const code = `export default function GeneratedLayout() {\n  return (\n    <div className="relative w-full h-full bg-white">\n${generateReactCode(elements)}\n    </div>\n  );\n}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success("React code copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e] border border-white/10 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between p-3 border-b border-white/10 bg-white/5">
        <span className="text-xs font-medium text-white/60">Generated React Code</span>
        <Button variant="ghost" size="icon" onClick={handleCopy} className="h-6 w-6 text-white/60 hover:text-white">
          {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
        </Button>
      </div>
      <div className="flex-1 overflow-auto p-4">
        <pre className="text-xs font-mono text-blue-300 whitespace-pre">
          {code}
        </pre>
      </div>
    </div>
  );
};
