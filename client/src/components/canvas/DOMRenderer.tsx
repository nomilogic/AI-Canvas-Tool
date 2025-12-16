import React from 'react';
import { CanvasElement } from '../../lib/ai-parser';
import { motion } from 'framer-motion';

interface DOMRendererProps {
  elements: CanvasElement[];
  width: number;
  height: number;
  onSelect: (id: string | null) => void;
  selectedId: string | null;
}

const ElementRenderer: React.FC<{ element: CanvasElement; onSelect: any; selectedId: any }> = ({ element, onSelect, selectedId }) => {
  const isSelected = selectedId === element.id;

  const baseStyle: React.CSSProperties = {
    position: element.layout === 'flex' ? 'relative' : 'absolute',
    left: element.layout === 'flex' ? undefined : element.x,
    top: element.layout === 'flex' ? undefined : element.y,
    width: element.width,
    height: element.height,
    backgroundColor: element.fill,
    opacity: element.opacity ?? 1,
    cursor: 'pointer',
    border: isSelected ? '2px solid #3b82f6' : '1px solid transparent',
    boxSizing: 'border-box',
    display: element.type === 'container' ? 'flex' : 'block',
    flexDirection: element.direction || 'row',
    alignItems: element.align === 'center' ? 'center' : element.align === 'end' ? 'flex-end' : 'flex-start',
    justifyContent: element.justify === 'center' ? 'center' : element.justify === 'between' ? 'space-between' : 'flex-start',
    gap: element.gap,
    padding: element.padding,
    borderRadius: element.type === 'circle' ? '50%' : (element.radius || 4),
    overflow: 'hidden',
    color: element.fill && element.type === 'text' ? element.fill : 'inherit',
    fontSize: element.fontSize,
  };

  // Text specific overrides
  if (element.type === 'text') {
    return (
      <div 
        onClick={(e) => { e.stopPropagation(); onSelect(element.id); }}
        style={{...baseStyle, border: isSelected ? '1px dashed #3b82f6' : 'none', backgroundColor: 'transparent'}}
        className="font-sans font-medium whitespace-pre-wrap"
      >
        {element.text}
      </div>
    );
  }

  return (
    <div 
      onClick={(e) => { e.stopPropagation(); onSelect(element.id); }}
      style={baseStyle}
      className="transition-all duration-200"
    >
      {element.children?.map(child => (
        <ElementRenderer key={child.id} element={child} onSelect={onSelect} selectedId={selectedId} />
      ))}
    </div>
  );
};

export const DOMRenderer: React.FC<DOMRendererProps> = ({ elements, width, height, onSelect, selectedId }) => {
  return (
    <div 
      className="relative bg-white shadow-xl overflow-hidden" // Changed to white paper-like background for HTML mode
      style={{ width, height }}
      onClick={() => onSelect(null)}
    >
      {elements.map((el) => (
        <ElementRenderer key={el.id} element={el} onSelect={onSelect} selectedId={selectedId} />
      ))}
    </div>
  );
};
