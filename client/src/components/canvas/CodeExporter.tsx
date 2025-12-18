import React from 'react';
import type { TemplateElement, ShapeElement, TextElement, LogoElement, SvgElement } from '../../types/templates';
import { Button } from '@/components/ui/button';
import { Copy, Check } from 'lucide-react';
import { toast } from 'sonner';

interface CodeExporterProps {
  elements: TemplateElement[];
}

export const CodeExporter: React.FC<CodeExporterProps> = ({ elements }) => {
  const [copied, setCopied] = React.useState(false);

  const escapeText = (s: string) => s.replace(/`/g, '\\`');

  const generateReactCode = (els: TemplateElement[], indentLevel = 2): string => {
    const indent = " ".repeat(indentLevel);

    return els
      .slice()
      .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
      .map((el) => {
        const style: string[] = [];
        style.push(`position: \"absolute\"`);
        style.push(`left: ${Math.round(el.x)}`);
        style.push(`top: ${Math.round(el.y)}`);
        style.push(`width: ${Math.round(el.width)}`);
        style.push(`height: ${Math.round(el.height)}`);
        if (el.rotation) style.push(`transform: \"rotate(${Math.round(el.rotation)}deg)\"`);

        if (el.type === 'shape') {
          const s = el as ShapeElement;
          style.push(`backgroundColor: \"${s.color}\"`);
          if (s.opacity !== undefined) style.push(`opacity: ${s.opacity}`);
          if (s.shape === 'circle') style.push(`borderRadius: \"9999px\"`);
          else if (s.borderRadius !== undefined) style.push(`borderRadius: ${Math.round(s.borderRadius)}`);

          return `${indent}<div style={{ ${style.join(', ')} }} />`;
        }

        if (el.type === 'text') {
          const t = el as TextElement;
          style.push(`color: \"${t.color}\"`);
          style.push(`fontSize: ${Math.round(t.fontSize)}`);
          style.push(`fontFamily: \"${t.fontFamily || 'Inter'}\"`);
          style.push(`fontWeight: \"${t.fontWeight}\"`);
          style.push(`textAlign: \"${t.textAlign}\"`);
          style.push(`display: \"flex\"`);
          style.push(`alignItems: \"center\"`);
          style.push(`justifyContent: \"center\"`);

          return `${indent}<div style={{ ${style.join(', ')} }}>${escapeText(t.content)}</div>`;
        }

        if (el.type === 'image') {
          const img = el as LogoElement;
          const imgStyle = [...style];
          if (img.opacity !== undefined) imgStyle.push(`opacity: ${img.opacity}`);
          imgStyle.push(`objectFit: \"cover\"`);
          if (img.borderRadius !== undefined) imgStyle.push(`borderRadius: ${Math.round(img.borderRadius)}`);
          return `${indent}<img alt=\"\" src=\"${img.src}\" style={{ ${imgStyle.join(', ')} }} />`;
        }

        if (el.type === 'svg') {
          const svg = el as SvgElement;
          const svgStyle = [...style];
          if (svg.opacity !== undefined) svgStyle.push(`opacity: ${svg.opacity}`);

          const fill = svg.fill ?? 'currentColor';
          const stroke = svg.stroke;
          const strokeWidth = svg.strokeWidth;

          const strokeAttrs = stroke
            ? ` stroke=\"${stroke}\"${strokeWidth !== undefined ? ` strokeWidth={${strokeWidth}}` : ''}`
            : '';

          return `${indent}<svg viewBox=\"0 0 100 100\" style={{ ${svgStyle.join(', ')} }}>
${indent}  <path d=\"${svg.content}\" fill=\"${fill}\"${strokeAttrs} />
${indent}</svg>`;
        }

        return `${indent}<!-- Unsupported element type: ${(el as any).type} -->`;
      })
      .join('\n');
  };

  const code = `export default function GeneratedLayout() {\n  return (\n    <div style={{ position: \"relative\", width: 800, height: 600, backgroundColor: \"#fff\" }}>\n${generateReactCode(elements)}\n    </div>\n  );\n}`;

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
