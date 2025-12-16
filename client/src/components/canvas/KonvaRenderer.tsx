import React from 'react';
import { Stage, Layer, Rect, Circle, Text, Transformer } from 'react-konva';
import { CanvasElement } from '../../lib/ai-parser';

interface KonvaRendererProps {
  elements: CanvasElement[];
  width: number;
  height: number;
  onSelect: (id: string | null) => void;
  selectedId: string | null;
  onChange: (elements: CanvasElement[]) => void;
}

export const KonvaRenderer: React.FC<KonvaRendererProps> = ({ elements, width, height, onSelect, selectedId, onChange }) => {
  const trRef = React.useRef<any>(null);
  const stageRef = React.useRef<any>(null);

  React.useEffect(() => {
    if (selectedId && trRef.current && stageRef.current) {
      // Find the selected node
      const node = stageRef.current.findOne('#' + selectedId);
      if (node) {
        trRef.current.nodes([node]);
        trRef.current.getLayer().batchDraw();
      }
    } else if (trRef.current) {
        trRef.current.nodes([]);
        trRef.current.getLayer().batchDraw();
    }
  }, [selectedId, elements]);

  const handleDragEnd = (e: any, id: string) => {
    const newElements = elements.map(el => {
      if (el.id === id) {
        return {
          ...el,
          x: e.target.x(),
          y: e.target.y(),
        };
      }
      return el;
    });
    onChange(newElements);
  };

  const handleTransformEnd = (e: any, id: string) => {
    const node = e.target;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();

    // Reset scale to 1 and adjust width/height instead for rects
    node.scaleX(1);
    node.scaleY(1);

    const newElements = elements.map(el => {
      if (el.id === id) {
        const currentWidth = ensureNumber(el.width, 100);
        const currentHeight = ensureNumber(el.height, 100);
        const currentRadius = ensureNumber(el.radius, 50);

        const newWidth = Math.max(5, currentWidth * scaleX);
        const newHeight = Math.max(5, currentHeight * scaleY);
        const newRadius = Math.max(5, currentRadius * scaleX); // Approximate for circle

        return {
          ...el,
          x: node.x(),
          y: node.y(),
          width: el.type === 'circle' ? undefined : newWidth,
          height: el.type === 'circle' ? undefined : newHeight,
          radius: el.type === 'circle' ? newRadius : undefined,
          rotation: node.rotation(),
        };
      }
      return el;
    });
    onChange(newElements);
  };

  // Helper to ensure number for Konva
  const ensureNumber = (val: string | number | undefined, defaultVal: number = 0): number => {
    if (typeof val === 'number') return val;
    if (typeof val === 'string') return parseInt(val, 10) || defaultVal;
    return defaultVal;
  };

  return (
    <Stage 
      width={width} 
      height={height} 
      className="bg-white/5 shadow-2xl rounded-lg overflow-hidden"
      ref={stageRef}
      onMouseDown={(e) => {
        const clickedOnEmpty = e.target === e.target.getStage();
        if (clickedOnEmpty) {
          onSelect(null);
        }
      }}
    >
      <Layer>
        {/* Grid Background - simulated with a big rect for click capture if needed, or just CSS behind it */}
        {elements.map((el) => {
          // Skip container/flex types in Konva for now, or render them as groups if we wanted to be advanced
          if (el.type === 'container') return null;

          if (el.type === 'rect') {
            return (
              <Rect
                key={el.id}
                id={el.id}
                x={ensureNumber(el.x)}
                y={ensureNumber(el.y)}
                width={ensureNumber(el.width, 100)}
                height={ensureNumber(el.height, 100)}
                fill={el.fill}
                draggable
                onClick={() => onSelect(el.id)}
                onDragEnd={(e) => handleDragEnd(e, el.id)}
                onTransformEnd={(e) => handleTransformEnd(e, el.id)}
                cornerRadius={4}
                shadowColor="rgba(0,0,0,0.3)"
                shadowBlur={10}
                shadowOpacity={0.5}
              />
            );
          } else if (el.type === 'circle') {
             return (
              <Circle
                key={el.id}
                id={el.id}
                x={ensureNumber(el.x) + ensureNumber(el.radius)} 
                y={ensureNumber(el.y) + ensureNumber(el.radius)}
                radius={ensureNumber(el.radius, 50)}
                fill={el.fill}
                draggable
                onClick={() => onSelect(el.id)}
                onDragEnd={(e) => {
                    // Adjust back to top-left model if needed, or just store center
                     const newElements = elements.map(item => {
                        if (item.id === el.id) {
                            const r = ensureNumber(item.radius);
                            return { ...item, x: e.target.x() - r, y: e.target.y() - r };
                        }
                        return item;
                    });
                    onChange(newElements);
                }}
                shadowColor="rgba(0,0,0,0.3)"
                shadowBlur={10}
                shadowOpacity={0.5}
              />
            );
          } else if (el.type === 'text') {
            return (
              <Text
                key={el.id}
                id={el.id}
                x={ensureNumber(el.x)}
                y={ensureNumber(el.y)}
                text={el.text}
                fontSize={el.fontSize}
                fill={el.fill}
                draggable
                onClick={() => onSelect(el.id)}
                onDragEnd={(e) => handleDragEnd(e, el.id)}
                fontFamily="Inter"
              />
            );
          }
          return null;
        })}
        <Transformer ref={trRef} />
      </Layer>
    </Stage>
  );
};
