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
        const newWidth = Math.max(5, (el.width || 0) * scaleX);
        const newHeight = Math.max(5, (el.height || 0) * scaleY);
        const newRadius = Math.max(5, (el.radius || 0) * scaleX); // Approximate for circle

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
          if (el.type === 'rect') {
            return (
              <Rect
                key={el.id}
                id={el.id}
                x={el.x}
                y={el.y}
                width={el.width}
                height={el.height}
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
                x={el.x + (el.radius || 0)} // Konva circle x/y is center, but our model might be top-left based. Let's adjust.
                y={el.y + (el.radius || 0)}
                radius={el.radius}
                fill={el.fill}
                draggable
                onClick={() => onSelect(el.id)}
                onDragEnd={(e) => {
                    // Adjust back to top-left model if needed, or just store center
                     const newElements = elements.map(item => {
                        if (item.id === el.id) {
                            return { ...item, x: e.target.x() - (item.radius || 0), y: e.target.y() - (item.radius || 0) };
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
                x={el.x}
                y={el.y}
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
