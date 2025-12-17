import React, { useState, useRef, useEffect } from "react";
import { Stage, Layer, Rect, Circle, Text as KonvaText, Image as KonvaImage, Transformer, Group, Path } from "react-konva";
import Konva from "konva";
import useImage from "use-image";
import { 
  Type, Image as ImageIcon, Square, Circle as CircleIcon, 
  Triangle, Star, Palette, Layers, Download, 
  Settings, Undo, Redo, Trash2, Move, Monitor, Smartphone,
  Hexagon, Wand2, MousePointer2
} from "lucide-react";
import { TemplateElement, TextElement, ShapeElement, SvgElement, LogoElement, FilterProps, GradientProps } from "../types/templates";
import "../styles/template-editor.css";

// URLImage Component for loading images
const URLImage = ({ src, ...props }: any) => {
  const [image] = useImage(src, 'anonymous');
  return <KonvaImage image={image} {...props} />;
};

interface ImageTemplateEditorProps {
  elements: TemplateElement[];
  onChange: (elements: TemplateElement[]) => void;
}

export const ImageTemplateEditor: React.FC<ImageTemplateEditorProps> = ({ 
  elements,
  onChange 
}) => {
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  // const [elements, setElements] = useState<TemplateElement[]>(initialElements); // Removed local state
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const [history, setHistory] = useState<TemplateElement[][]>([elements]);
  const [historyStep, setHistoryStep] = useState(0);

  // Tools state
  const [activeTool, setActiveTool] = useState<string>('select');

  // Handle selection
  const handleSelect = (id: string) => {
    setSelectedId(id);
    setActiveTool('select');
  };

  // Add History
  const addToHistory = (newElements: TemplateElement[]) => {
    const newHistory = history.slice(0, historyStep + 1);
    newHistory.push(newElements);
    setHistory(newHistory);
    setHistoryStep(newHistory.length - 1);
    onChange(newElements); // Propagate change
  };

  const undo = () => {
    if (historyStep === 0) return;
    const previous = history[historyStep - 1];
    onChange(previous);
    setHistoryStep(historyStep - 1);
  };

  const redo = () => {
    if (historyStep === history.length - 1) return;
    const next = history[historyStep + 1];
    onChange(next);
    setHistoryStep(historyStep + 1);
  };

  // Element Creators
  const addText = () => {
    const newElement: TextElement = {
      id: crypto.randomUUID(),
      type: 'text',
      x: 50,
      y: 50,
      width: 200,
      height: 50,
      rotation: 0,
      zIndex: elements.length,
      content: 'Double click to edit',
      fontSize: 24,
      fontFamily: 'Inter',
      color: '#000000',
      textAlign: 'center',
      fontWeight: 'bold'
    };
    addToHistory([...elements, newElement]);
    setSelectedId(newElement.id);
  };

  const addShape = (shapeType: 'rectangle' | 'circle' | 'star') => {
    const newElement: ShapeElement = {
      id: crypto.randomUUID(),
      type: 'shape',
      shape: shapeType as any,
      x: 100,
      y: 100,
      width: 100,
      height: 100,
      rotation: 0,
      zIndex: elements.length,
      color: '#3b82f6',
      opacity: 1
    };
    addToHistory([...elements, newElement]);
    setSelectedId(newElement.id);
  };

  const addImage = (url: string) => {
    const newElement: LogoElement = {
      id: crypto.randomUUID(),
      type: 'image',
      src: url,
      x: 150,
      y: 150,
      width: 200,
      height: 200,
      rotation: 0,
      zIndex: elements.length,
      opacity: 1
    };
    addToHistory([...elements, newElement]);
    setSelectedId(newElement.id);
  };

  const addSvg = () => {
    // Adding a sample SVG path (a heart)
    const newElement: SvgElement = {
      id: crypto.randomUUID(),
      type: 'svg',
      content: "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z",
      x: 200,
      y: 200,
      width: 100,
      height: 100,
      rotation: 0,
      zIndex: elements.length,
      fill: '#ef4444',
      stroke: '#000000',
      strokeWidth: 0
    };
    addToHistory([...elements, newElement]);
    setSelectedId(newElement.id);
  };

  // Update Attributes
  const updateElement = (id: string, attrs: Partial<TemplateElement> | Partial<TextElement> | Partial<ShapeElement> | Partial<SvgElement> | Partial<LogoElement>) => {
    const newElements = elements.map(el => {
      if (el.id === id) {
        return { ...el, ...attrs } as any;
      }
      return el;
    });
    addToHistory(newElements);
  };

  // Delete Element
  const deleteElement = () => {
    if (!selectedId) return;
    const newElements = elements.filter(el => el.id !== selectedId);
    addToHistory(newElements);
    setSelectedId(null);
  };

  // Apply Filter
  const updateFilter = (filterName: keyof FilterProps, value: number) => {
    if (!selectedId) return;
    const el = elements.find(e => e.id === selectedId);
    if (!el) return;

    const currentFilters = el.filters || {};
    updateElement(selectedId, {
      filters: { ...currentFilters, [filterName]: value }
    });
  };

  // Apply Gradient
  const toggleGradient = (enabled: boolean) => {
    if (!selectedId) return;
    const el = elements.find(e => e.id === selectedId);
    if (!el || (el.type !== 'shape' && el.type !== 'text')) return;

    if (enabled) {
      updateElement(selectedId, {
        gradient: {
          enabled: true,
          type: 'linear',
          stops: [{ offset: 0, color: '#ff0000' }, { offset: 1, color: '#0000ff' }],
          start: { x: 0, y: 0 },
          end: { x: 100, y: 100 } // relative to shape
        }
      });
    } else {
      updateElement(selectedId, { gradient: undefined });
    }
  };

  // Handle Image Upload
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      addImage(url);
    }
  };

  // Effect to attach transformer
  useEffect(() => {
    if (selectedId && transformerRef.current && stageRef.current) {
      const node = stageRef.current.findOne('#' + selectedId);
      if (node) {
        transformerRef.current.nodes([node]);
        transformerRef.current.getLayer()?.batchDraw();
      }
    } else {
      transformerRef.current?.nodes([]);
    }
  }, [selectedId, elements]);


  const selectedElement = elements.find(e => e.id === selectedId);

  return (
    <div className="flex h-screen bg-[#1e1e1e] overflow-hidden text-white font-sans">
      
      {/* LEFT TOOLBAR */}
      <div className="w-16 bg-[#252526] border-r border-[#3e3e42] flex flex-col items-center py-4 gap-4 z-10">
        <div className="mb-4">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
            <Palette className="text-white" size={20} />
          </div>
        </div>

        <ToolButton icon={<MousePointer2 size={20} />} active={activeTool === 'select'} onClick={() => setActiveTool('select')} label="Select" />
        <ToolButton icon={<Type size={20} />} onClick={addText} label="Text" />
        <ToolButton icon={<Square size={20} />} onClick={() => addShape('rectangle')} label="Rect" />
        <ToolButton icon={<CircleIcon size={20} />} onClick={() => addShape('circle')} label="Circle" />
        <ToolButton icon={<Star size={20} />} onClick={() => addShape('star')} label="Star" />
        <ToolButton icon={<Hexagon size={20} />} onClick={addSvg} label="SVG" />
        
        <label className="cursor-pointer">
          <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
          <div className="w-10 h-10 rounded-md flex items-center justify-center hover:bg-[#3e3e42] text-gray-400 hover:text-white transition-colors">
            <ImageIcon size={20} />
          </div>
        </label>
        
        <div className="flex-1" />
        
        <ToolButton icon={<Undo size={20} />} onClick={undo} label="Undo" disabled={historyStep === 0} />
        <ToolButton icon={<Redo size={20} />} onClick={redo} label="Redo" disabled={historyStep === history.length - 1} />
      </div>

      {/* CANVAS AREA */}
      <div className="flex-1 bg-[#1e1e1e] relative overflow-auto flex items-center justify-center p-8">
        <div className="shadow-2xl border border-[#3e3e42]">
          <Stage
            ref={stageRef}
            width={canvasSize.width}
            height={canvasSize.height}
            className="bg-white"
            onMouseDown={(e) => {
              const clickedOnEmpty = e.target === e.target.getStage();
              if (clickedOnEmpty) {
                setSelectedId(null);
              }
            }}
          >
            <Layer>
              {elements.map((el) => {
                const commonProps = {
                  key: el.id,
                  id: el.id,
                  x: el.x,
                  y: el.y,
                  width: el.width,
                  height: el.height,
                  rotation: el.rotation || 0,
                  draggable: true,
                  onClick: () => handleSelect(el.id),
                  onTap: () => handleSelect(el.id),
                  onDragEnd: (e: any) => {
                    updateElement(el.id, {
                      x: e.target.x(),
                      y: e.target.y()
                    });
                  },
                  onTransformEnd: (e: any) => {
                    const node = e.target;
                    const scaleX = node.scaleX();
                    const scaleY = node.scaleY();
                    node.scaleX(1);
                    node.scaleY(1);
                    updateElement(el.id, {
                      x: node.x(),
                      y: node.y(),
                      width: Math.max(5, node.width() * scaleX),
                      height: Math.max(5, node.height() * scaleY),
                      rotation: node.rotation()
                    });
                  }
                };

                // Filters logic
                let filters = [];
                if (el.filters) {
                  if (el.filters.blur) filters.push(Konva.Filters.Blur);
                  if (el.filters.brightness) filters.push(Konva.Filters.Brighten);
                  if (el.filters.contrast) filters.push(Konva.Filters.Contrast);
                  // ... add others as needed
                }

                // Gradient logic
                let fillProps: any = {};
                if ((el.type === 'shape' || el.type === 'text') && (el as any).gradient?.enabled) {
                   const grad = (el as any).gradient!;
                   fillProps = {
                     fillPriority: 'linear-gradient',
                     fillLinearGradientStartPoint: grad.start,
                     fillLinearGradientEndPoint: grad.end,
                     fillLinearGradientColorStops: grad.stops.flatMap((s: any) => [s.offset, s.color])
                   };
                } else if (el.type === 'shape') {
                  fillProps = { fill: (el as ShapeElement).color };
                } else if (el.type === 'text') {
                  fillProps = { fill: (el as TextElement).color };
                } else if (el.type === 'svg') {
                  fillProps = { 
                    fill: (el as SvgElement).fill,
                    stroke: (el as SvgElement).stroke,
                    strokeWidth: (el as SvgElement).strokeWidth
                  };
                }

                if (el.type === 'text') {
                  const textEl = el as TextElement;
                  return (
                    <KonvaText
                      {...commonProps}
                      text={textEl.content}
                      fontSize={textEl.fontSize}
                      fontFamily={textEl.fontFamily}
                      align={textEl.textAlign}
                      {...fillProps}
                      filters={filters}
                      blurRadius={el.filters?.blur}
                      brightness={el.filters?.brightness}
                      contrast={el.filters?.contrast}
                    />
                  );
                } else if (el.type === 'shape') {
                  const shapeEl = el as ShapeElement;
                  if (shapeEl.shape === 'circle') {
                    return (
                      <Circle
                        {...commonProps}
                        radius={shapeEl.width / 2}
                        offsetX={-shapeEl.width / 2} // Center adjustment if needed, but Circle uses radius
                        offsetY={-shapeEl.height / 2}
                        {...fillProps}
                        opacity={shapeEl.opacity}
                        filters={filters}
                      />
                    );
                  } else if (shapeEl.shape === 'star') {
                    // Konva Star
                     return (
                      <Rect // Using Rect as placeholder for simplified logic, or actually use Star
                        {...commonProps}
                        cornerRadius={shapeEl.borderRadius}
                        {...fillProps}
                        opacity={shapeEl.opacity}
                        filters={filters}
                      />
                    );
                  }
                  return (
                    <Rect
                      {...commonProps}
                      cornerRadius={shapeEl.borderRadius}
                      {...fillProps}
                      opacity={shapeEl.opacity}
                      filters={filters}
                    />
                  );
                } else if (el.type === 'image') {
                   const imgEl = el as LogoElement;
                   return (
                     <URLImage 
                        {...commonProps}
                        src={imgEl.src}
                        opacity={imgEl.opacity}
                        filters={filters}
                     />
                   );
                } else if (el.type === 'svg') {
                  const svgEl = el as SvgElement;
                  return (
                    <Path 
                      {...commonProps}
                      data={svgEl.content}
                      {...fillProps}
                      scaleX={el.width / 100} // Rough scaling for path
                      scaleY={el.height / 100}
                    />
                  );
                }
                return null;
              })}
              <Transformer ref={transformerRef} />
            </Layer>
          </Stage>
        </div>
      </div>

      {/* RIGHT PROPERTIES PANEL */}
      <div className="w-64 bg-[#252526] border-l border-[#3e3e42] flex flex-col overflow-y-auto">
        <div className="p-4 border-b border-[#3e3e42]">
          <h2 className="font-semibold text-sm text-gray-200">Properties</h2>
        </div>

        {selectedElement ? (
          <div className="p-4 space-y-6">
            
            {/* Common Properties */}
            <div className="space-y-2">
              <label className="text-xs text-gray-400">Position</label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-xs text-gray-500">X</span>
                  <input 
                    type="number" 
                    value={Math.round(selectedElement.x)} 
                    onChange={(e) => updateElement(selectedElement.id, { x: Number(e.target.value) })}
                    className="w-full bg-[#3e3e42] rounded px-2 py-1 text-sm mt-1"
                  />
                </div>
                <div>
                  <span className="text-xs text-gray-500">Y</span>
                  <input 
                    type="number" 
                    value={Math.round(selectedElement.y)} 
                    onChange={(e) => updateElement(selectedElement.id, { y: Number(e.target.value) })}
                    className="w-full bg-[#3e3e42] rounded px-2 py-1 text-sm mt-1"
                  />
                </div>
              </div>
            </div>

            {/* Type Specific Properties */}
            {selectedElement.type === 'text' && (
              <div className="space-y-4">
                 <div>
                  <label className="text-xs text-gray-400">Content</label>
                  <textarea 
                    value={(selectedElement as TextElement).content}
                    onChange={(e) => updateElement(selectedElement.id, { content: e.target.value })}
                    className="w-full bg-[#3e3e42] rounded px-2 py-1 text-sm mt-1 min-h-[60px]"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400">Color</label>
                  <input 
                    type="color" 
                    value={(selectedElement as TextElement).color}
                    onChange={(e) => updateElement(selectedElement.id, { color: e.target.value })}
                    className="w-full h-8 bg-[#3e3e42] rounded cursor-pointer mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400">Font Size</label>
                  <input 
                    type="range" min="8" max="120"
                    value={(selectedElement as TextElement).fontSize}
                    onChange={(e) => updateElement(selectedElement.id, { fontSize: Number(e.target.value) })}
                    className="w-full mt-1 template-range"
                  />
                </div>
              </div>
            )}

            {selectedElement.type === 'shape' && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-gray-400">Color</label>
                  <input 
                    type="color" 
                    value={(selectedElement as ShapeElement).color}
                    onChange={(e) => updateElement(selectedElement.id, { color: e.target.value })}
                    className="w-full h-8 bg-[#3e3e42] rounded cursor-pointer mt-1"
                  />
                </div>
                 <div className="flex items-center justify-between">
                  <label className="text-xs text-gray-400">Gradient</label>
                  <input 
                    type="checkbox" 
                    checked={!!(selectedElement as any).gradient?.enabled}
                    onChange={(e) => toggleGradient(e.target.checked)}
                  />
                </div>
              </div>
            )}

            {selectedElement.type === 'svg' && (
               <div className="space-y-4">
                <div>
                  <label className="text-xs text-gray-400">Fill Color</label>
                  <input 
                    type="color" 
                    value={(selectedElement as SvgElement).fill || '#000000'}
                    onChange={(e) => updateElement(selectedElement.id, { fill: e.target.value })}
                    className="w-full h-8 bg-[#3e3e42] rounded cursor-pointer mt-1"
                  />
                </div>
               </div>
            )}

            {/* Filters Section */}
            <div className="space-y-3 pt-4 border-t border-[#3e3e42]">
              <div className="flex items-center gap-2 mb-2">
                <Wand2 size={14} className="text-blue-400"/>
                <span className="text-xs font-semibold text-gray-300">Filters</span>
              </div>
              
              <FilterControl label="Blur" value={selectedElement.filters?.blur || 0} onChange={(v: number) => updateFilter('blur', v)} max={20} />
              <FilterControl label="Brightness" value={selectedElement.filters?.brightness || 0} onChange={(v: number) => updateFilter('brightness', v)} min={-1} max={1} step={0.1} />
              <FilterControl label="Contrast" value={selectedElement.filters?.contrast || 0} onChange={(v: number) => updateFilter('contrast', v)} min={-100} max={100} />
            </div>

            <div className="pt-6">
              <button 
                onClick={deleteElement}
                className="w-full bg-red-500/10 text-red-500 hover:bg-red-500/20 py-2 rounded text-sm flex items-center justify-center gap-2 transition-colors"
              >
                <Trash2 size={16} /> Delete Element
              </button>
            </div>

          </div>
        ) : (
          <div className="p-8 text-center text-gray-500 text-sm">
            Select an element to edit its properties
          </div>
        )}

        {/* Global Output View (for AI / JSON requirement) */}
        <div className="mt-auto p-4 border-t border-[#3e3e42]">
           <button 
             onClick={() => {
                const json = JSON.stringify(elements, null, 2);
                console.log(json);
                alert("JSON Structure logged to console (and ready for AI)");
             }}
             className="w-full bg-[#3e3e42] hover:bg-[#4e4e52] text-white py-2 rounded text-xs flex items-center justify-center gap-2"
           >
             <Monitor size={14} /> View JSON Structure
           </button>
        </div>
      </div>
    </div>
  );
};

const ToolButton = ({ icon, onClick, active, label, disabled }: any) => (
  <button 
    onClick={onClick}
    disabled={disabled}
    className={`
      w-10 h-10 rounded-md flex items-center justify-center transition-colors relative group
      ${active ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-[#3e3e42] hover:text-white'}
      ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
    `}
  >
    {icon}
    <span className="absolute left-14 bg-black text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
      {label}
    </span>
  </button>
);

const FilterControl = ({ label, value, onChange, min=0, max=100, step=1 }: any) => (
  <div>
    <div className="flex justify-between mb-1">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-xs text-gray-400">{Math.round(value * 100) / 100}</span>
    </div>
    <input 
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full template-range"
    />
  </div>
);
