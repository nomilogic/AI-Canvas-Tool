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

export const DOMRenderer: React.FC<DOMRendererProps> = ({ elements, width, height, onSelect, selectedId }) => {
  return (
    <div 
      className="relative bg-white/5 shadow-2xl rounded-lg overflow-hidden border border-white/10"
      style={{ width, height }}
      onClick={() => onSelect(null)}
    >
      {elements.map((el) => {
        const isSelected = selectedId === el.id;
        
        const commonStyle: React.CSSProperties = {
          position: 'absolute',
          left: el.x,
          top: el.y,
          cursor: 'pointer',
          zIndex: isSelected ? 50 : 10,
          boxShadow: isSelected ? '0 0 0 2px #3b82f6, 0 10px 20px rgba(0,0,0,0.2)' : '0 4px 6px rgba(0,0,0,0.1)',
        };

        if (el.type === 'rect') {
          return (
            <motion.div
              key={el.id}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              style={{
                ...commonStyle,
                width: el.width,
                height: el.height,
                backgroundColor: el.fill,
                borderRadius: 4,
              }}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(el.id);
              }}
            />
          );
        } else if (el.type === 'circle') {
          return (
             <motion.div
              key={el.id}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              style={{
                ...commonStyle,
                width: (el.radius || 0) * 2,
                height: (el.radius || 0) * 2,
                backgroundColor: el.fill,
                borderRadius: '50%',
              }}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(el.id);
              }}
            />
          );
        } else if (el.type === 'text') {
           return (
            <motion.div
              key={el.id}
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              style={{
                ...commonStyle,
                color: el.fill,
                fontSize: el.fontSize,
                fontFamily: 'Inter, sans-serif',
                whiteSpace: 'nowrap',
                fontWeight: 600,
                boxShadow: 'none',
                border: isSelected ? '1px dashed #3b82f6' : 'none',
              }}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(el.id);
              }}
            >
              {el.text}
            </motion.div>
          );
        }
        return null;
      })}
    </div>
  );
};
