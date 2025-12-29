import React, { useState, useRef, useEffect } from "react";
// Switched from Konva canvas to DOM-based absolute positioning with a TransformBox.
import { TransformBox, DomTransform } from "./dom/TransformBox";
import {
  Type,
  Image as ImageIcon,
  Square,
  Circle as CircleIcon,
  Palette,
  Undo,
  Redo,
  Trash2,
  Monitor,
  Hexagon,
  MousePointer2,
  Lock,
  Unlock,
  GripVertical,
  Eye,
  EyeOff,
  Group,
  AlignLeft,
  AlignCenter,
  AlignRight,
  ChevronDown,
  Hand,
  Settings,
  // Icon picker choices
  Heart,
  Check,
  X,
  Plus,
  Minus,
  ArrowRight,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Smile,
  Zap,
  Sparkles,
  Crown,
  Flame,
  Shield,
  Star,
} from "lucide-react";
import { Reorder, useDragControls } from "framer-motion";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TemplateElement, TextElement, ShapeElement, SvgElement, LogoElement, GroupElement, IconElement, FilterProps, GradientProps, ShadowProps } from "../types/templates";
import { updateHtmlForTransforms, updateHtmlRawStyle, deleteHtmlElementsById, updateHtmlTextContent, appendElementsToHtml, updateHtmlSvgContent } from "../lib/layout-html";
import AIModelSelector from "./AIModelSelector";
import callPuterChat from "../lib/puter-client";
import { toast } from "sonner";
import "../styles/template-editor.css";

// Icon map for rendering Lucide icons
const ICON_MAP: Record<string, React.ComponentType<any>> = {
  Heart, Check, X, Plus, Minus, ArrowRight, ArrowLeft, ArrowUp, ArrowDown,
  Smile, Zap, Sparkles, Crown, Flame, Shield, Star,
};

// Emoji mapping for icons
const ICON_EMOJI: Record<string, string> = {
  'Plus': '➕',
  'Minus': '➖',
  'X': '❌',
  'Check': '✅',
  'Heart': '❤️',
  'Star': '⭐',
  'Smile': '😊',
  'ArrowRight': '➡️',
  'ArrowLeft': '⬅️',
  'ArrowUp': '⬆️',
  'ArrowDown': '⬇️',
  'Zap': '⚡',
  'Sparkles': '✨',
  'Crown': '👑',
  'Flame': '🔥',
  'Shield': '🛡️',
  'Bell': '🔔',
  'Settings': '⚙️',
  'Search': '🔍',
  'Edit': '✏️',
  'Trash': '🗑️',
  'Save': '💾',
  'Home': '🏠',
  'Lock': '🔒',
  'Unlock': '🔓',
  'Eye': '👁️',
  'Mail': '📧',
  'Phone': '☎️',
  'Link': '🔗',
  'Share': '📤',
  'Thumbs': '👍',
  'Comment': '💬',
  'Menu': '☰',
  'Warning': '⚠️',
  'Info': 'ℹ️',
  'Folder': '📁',
  'File': '📄',
  'Calendar': '📅',
  'Clock': '🕐',
  'Download': '⬇️',
  'Upload': '⬆️',
  'Checkmark': '✔️',
  'Expand': '↗️',
  'Collapse': '↙️',
  'Refresh': '🔄',
  'Play': '▶️',
  'Pause': '⏸️',
  'Stop': '⏹️',
  'Volume': '🔊',
  'Mute': '🔇',
  'Brightness': '☀️',
  'Moon': '🌙',
  'Cloud': '☁️',
  'Coffee': '☕',
  'Gift': '🎁',
  'Target': '🎯',
  'Fire': '🔥',
  'Water': '💧',
  'Bug': '🐛',
  'Rocket': '🚀',
  'Key': '🔑',
  'Certificate': '🏆',
  'Briefcase': '💼',
  'Wallet': '👛',
  'Dice': '🎲',
};

interface ImageTemplateEditorProps {
  elements: TemplateElement[];
  onChange: (elements: TemplateElement[]) => void;
  onCanvasSizeChange?: (size: { width: number; height: number }) => void;
  aiSchemaMode?: boolean;
  onAiSchemaModeChange?: (next: boolean) => void;
  /** The canonical HTML layout string used for rendering the canvas content. */
  htmlLayout?: string;
  /** Notify parent when the canonical HTML layout should change (e.g. drag/resize/rotate). */
  onHtmlLayoutChange?: (html: string) => void;
  /** Parent can capture the actual canvas DOM element (white box) for PNG export. */
  onCanvasElementRefChange?: (el: HTMLDivElement | null) => void;
  /** Allow parent (header) to trigger editor-level actions like undo/redo. */
  onRegisterEditorActions?: (actions: { undo: () => void; redo: () => void }) => void;
}

export const ImageTemplateEditor: React.FC<ImageTemplateEditorProps> = ({ 
  elements,
  onChange,
  onCanvasSizeChange,
  aiSchemaMode,
  onAiSchemaModeChange,
  htmlLayout,
  onHtmlLayoutChange,
  onCanvasElementRefChange,
  onRegisterEditorActions,
}) => {
  const canvasFrameRef = useRef<HTMLDivElement | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [openLayerIds, setOpenLayerIds] = useState<string[]>([]);
  const [iconPopoverOpen, setIconPopoverOpen] = useState(false);
  const [shapesPopoverOpen, setShapesPopoverOpen] = useState(false);
  const [openCollapsible, setOpenCollapsible] = useState<string | null>(null);

  // Canvas presets + zoom
  const CANVAS_PRESETS = {
    "16:9": { width: 1280, height: 720 },
    "9:16": { width: 720, height: 1280 },
    "1:1": { width: 1024, height: 1024 },
  } as const;
  type CanvasPresetKey = keyof typeof CANVAS_PRESETS;

  const [canvasPreset, setCanvasPreset] = useState<CanvasPresetKey>("16:9");
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number }>(
    CANVAS_PRESETS["16:9"],
  );
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [gridSize, setGridSize] = useState<number>(10);
  const canvasViewportRef = useRef<HTMLDivElement | null>(null);

  const panStateRef = useRef<{
    isPanning: boolean;
    startX: number;
    startY: number;
    startPanX: number;
    startPanY: number;
  } | null>(null);

  const clampZoom = (z: number) => Math.min(4, Math.max(0.1, z));

  const fitZoomToViewport = () => {
    const vp = canvasViewportRef.current;
    if (!vp) return;

    // Leave some padding so the border/shadow doesn't clip.
    const padding = 64;
    const w = Math.max(1, vp.clientWidth - padding);
    const h = Math.max(1, vp.clientHeight - padding);

    const next = Math.min(w / canvasSize.width, h / canvasSize.height, 1);
    setZoom(clampZoom(next));
  };

  useEffect(() => {
    // When preset changes, update canvas size + refit zoom.
    setCanvasSize(CANVAS_PRESETS[canvasPreset]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasPreset]);

  useEffect(() => {
    fitZoomToViewport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasSize.width, canvasSize.height]);

  // Clamp pan so you can only move until the white canvas edges (no extra empty scroll).
  const clampPanToCanvas = (raw: { x: number; y: number }) => {
    const vp = canvasViewportRef.current;
    if (!vp) return raw;

    const vw = vp.clientWidth;
    const vh = vp.clientHeight;
    const contentW = canvasSize.width * zoom;
    const contentH = canvasSize.height * zoom;

    // Horizontal bounds
    let minX: number;
    let maxX: number;
    if (contentW <= vw) {
      const centeredX = (vw - contentW) / 2;
      minX = maxX = centeredX;
    } else {
      minX = vw - contentW;
      maxX = 0;
    }

    // Vertical bounds
    let minY: number;
    let maxY: number;
    if (contentH <= vh) {
      const centeredY = (vh - contentH) / 2;
      minY = maxY = centeredY;
    } else {
      minY = vh - contentH;
      maxY = 0;
    }

    return {
      x: Math.min(maxX, Math.max(minX, raw.x)),
      y: Math.min(maxY, Math.max(minY, raw.y)),
    };
  };

  // Keep the white canvas visually centered when size or zoom changes.
  useEffect(() => {
    const vp = canvasViewportRef.current;
    if (!vp) return;
    const contentW = canvasSize.width * zoom;
    const contentH = canvasSize.height * zoom;
    const initial = {
      x: (vp.clientWidth - contentW) / 2,
      y: (vp.clientHeight - contentH) / 2,
    };
    setPan(clampPanToCanvas(initial));
  }, [canvasSize.width, canvasSize.height, zoom]);

  useEffect(() => {
    onCanvasSizeChange?.(canvasSize);
  }, [canvasSize.width, canvasSize.height, onCanvasSizeChange]);

  const [history, setHistory] = useState<TemplateElement[][]>([elements]);
  const [historyStep, setHistoryStep] = useState(0);

  // Tools state
  const [activeTool, setActiveTool] = useState<string>('select');

  // Puter / Claude (Ask Claude panel)
  const [claudeOpen, setClaudeOpen] = useState(false);
  const [claudePrompt, setClaudePrompt] = useState<string>("Describe an element...");
  const [claudeResponse, setClaudeResponse] = useState<string | null>(null);
  const [claudeLoading, setClaudeLoading] = useState<boolean>(false);

  // Selection
  // - Canvas click selects a single layer.
  // - Layers panel checkboxes allow multi-select (no Shift required).
  const selectSingle = (id: string) => {
    setSelectedIds([id]);
    setActiveTool('select');
  };

  const toggleSelected = (id: string, next?: boolean) => {
    setSelectedIds((prev) => {
      const has = prev.includes(id);
      const shouldSelect = next ?? !has;
      if (shouldSelect) return has ? prev : [...prev, id];
      return prev.filter((x) => x !== id);
    });
    setActiveTool('select');
  };

  // Add History
  const addToHistory = (newElements: TemplateElement[], options?: { skipOnChange?: boolean }) => {
    setHistory((prev) => {
      const nextHistory = prev.slice(0, historyStep + 1);
      nextHistory.push(newElements);
      return nextHistory;
    });
    setHistoryStep((prevStep) => prevStep + 1);
    if (!options?.skipOnChange) {
      onChange(newElements); // Propagate change when we intentionally want to rebuild from elements
    }
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

  // Expose undo/redo to parent (header) so buttons there can trigger them.
  useEffect(() => {
    if (!onRegisterEditorActions) return;
    onRegisterEditorActions({ undo, redo });
  }, [onRegisterEditorActions, undo, redo]);

  // Lucide icon picker
  // Emoji icon choices
  const LUCIDE_ICON_CHOICES = [
    { name: 'Heart', Icon: Heart },
    { name: 'Check', Icon: Check },
    { name: 'X', Icon: X },
    { name: 'Plus', Icon: Plus },
    { name: 'Minus', Icon: Minus },
    { name: 'ArrowRight', Icon: ArrowRight },
    { name: 'ArrowLeft', Icon: ArrowLeft },
    { name: 'ArrowUp', Icon: ArrowUp },
    { name: 'ArrowDown', Icon: ArrowDown },
    { name: 'Smile', Icon: Smile },
    { name: 'Zap', Icon: Zap },
    { name: 'Star', Icon: Star },
    { name: 'Sparkles', Icon: Sparkles },
    { name: 'Crown', Icon: Crown },
    { name: 'Flame', Icon: Flame },
    { name: 'Shield', Icon: Shield },
    { name: 'Bell', Icon: Heart },
    { name: 'Settings', Icon: Heart },
    { name: 'Search', Icon: Heart },
    { name: 'Edit', Icon: Heart },
    { name: 'Trash', Icon: Heart },
    { name: 'Save', Icon: Heart },
    { name: 'Home', Icon: Heart },
    { name: 'Lock', Icon: Heart },
    { name: 'Unlock', Icon: Heart },
    { name: 'Eye', Icon: Heart },
    { name: 'Mail', Icon: Heart },
    { name: 'Phone', Icon: Heart },
    { name: 'Link', Icon: Heart },
    { name: 'Share', Icon: Heart },
    { name: 'Thumbs', Icon: Heart },
    { name: 'Comment', Icon: Heart },
    { name: 'Menu', Icon: Heart },
    { name: 'Warning', Icon: Heart },
    { name: 'Info', Icon: Heart },
    { name: 'Folder', Icon: Heart },
    { name: 'File', Icon: Heart },
    { name: 'Calendar', Icon: Heart },
    { name: 'Clock', Icon: Heart },
    { name: 'Download', Icon: Heart },
    { name: 'Upload', Icon: Heart },
    { name: 'Checkmark', Icon: Heart },
    { name: 'Expand', Icon: Heart },
    { name: 'Collapse', Icon: Heart },
    { name: 'Refresh', Icon: Heart },
    { name: 'Play', Icon: Heart },
    { name: 'Pause', Icon: Heart },
    { name: 'Stop', Icon: Heart },
    { name: 'Volume', Icon: Heart },
    { name: 'Mute', Icon: Heart },
    { name: 'Brightness', Icon: Heart },
    { name: 'Moon', Icon: Heart },
    { name: 'Cloud', Icon: Heart },
    { name: 'Coffee', Icon: Heart },
    { name: 'Gift', Icon: Heart },
    { name: 'Target', Icon: Heart },
    { name: 'Fire', Icon: Heart },
    { name: 'Water', Icon: Heart },
    { name: 'Bug', Icon: Heart },
    { name: 'Rocket', Icon: Heart },
    { name: 'Key', Icon: Heart },
    { name: 'Certificate', Icon: Heart },
    { name: 'Briefcase', Icon: Heart },
    { name: 'Wallet', Icon: Heart },
    { name: 'Dice', Icon: Heart },
  ] as const;

  const lucideToPathData = (LucideIcon: any, name?: string): string | null => {
    // Try method 1: Extract from iconNode
    const nodes: Array<[string, Record<string, any>]> | undefined = LucideIcon?.iconNode;
    if (Array.isArray(nodes) && nodes.length > 0) {
      const pathDs = nodes
        .filter(([tag]) => tag === 'path')
        .map(([, attrs]) => String(attrs?.d ?? ''))
        .filter(Boolean);

      // If there are path nodes, use them
      if (pathDs.length > 0) {
        return pathDs.join(' ');
      }

      // Fallback: Try to convert circles, lines, etc. to path equivalents
      const convertedPaths: string[] = [];
      for (const [tag, attrs] of nodes) {
        if (tag === 'path') {
          const d = String(attrs?.d ?? '');
          if (d) convertedPaths.push(d);
        } else if (tag === 'circle') {
          const cx = Number(attrs?.cx ?? 0);
          const cy = Number(attrs?.cy ?? 0);
          const r = Number(attrs?.r ?? 0);
          if (r > 0) {
            const d = `M ${cx} ${cy} m -${r} 0 a ${r} ${r} 0 1 0 ${r * 2} 0 a ${r} ${r} 0 1 0 -${r * 2} 0`;
            convertedPaths.push(d);
          }
        } else if (tag === 'line') {
          const x1 = Number(attrs?.x1 ?? 0);
          const y1 = Number(attrs?.y1 ?? 0);
          const x2 = Number(attrs?.x2 ?? 0);
          const y2 = Number(attrs?.y2 ?? 0);
          const d = `M ${x1} ${y1} L ${x2} ${y2}`;
          convertedPaths.push(d);
        } else if (tag === 'rect') {
          const x = Number(attrs?.x ?? 0);
          const y = Number(attrs?.y ?? 0);
          const width = Number(attrs?.width ?? 0);
          const height = Number(attrs?.height ?? 0);
          const rx = Number(attrs?.rx ?? 0);
          if (width > 0 && height > 0) {
            const d = `M ${x + rx} ${y} h ${width - 2 * rx} a ${rx} ${rx} 0 0 1 ${rx} ${rx} v ${height - 2 * rx} a ${rx} ${rx} 0 0 1 -${rx} ${rx} h -${width - 2 * rx} a ${rx} ${rx} 0 0 1 -${rx} -${rx} v -${height - 2 * rx} a ${rx} ${rx} 0 0 1 ${rx} -${rx}`;
            convertedPaths.push(d);
          }
        } else if (tag === 'polygon') {
          const points = String(attrs?.points ?? '').split(' ').map(p => p.split(','));
          if (points.length > 0) {
            const pathParts = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`);
            const d = pathParts.join(' ') + ' Z';
            convertedPaths.push(d);
          }
        } else if (tag === 'polyline') {
          const points = String(attrs?.points ?? '').split(' ').map(p => p.split(','));
          if (points.length > 0) {
            const pathParts = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`);
            const d = pathParts.join(' ');
            convertedPaths.push(d);
          }
        }
      }

      if (convertedPaths.length > 0) {
        return convertedPaths.join(' ');
      }
    }

    // Method 2: Try to render the icon and extract SVG paths from the rendered element
    try {
      const svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svgElement.setAttribute('width', '24');
      svgElement.setAttribute('height', '24');
      svgElement.setAttribute('viewBox', '0 0 24 24');
      svgElement.setAttribute('fill', 'none');
      svgElement.setAttribute('stroke', 'currentColor');
      svgElement.setAttribute('stroke-width', '2');
      svgElement.style.visibility = 'hidden';
      svgElement.style.position = 'absolute';

      // Render the icon component to get the SVG
      const container = document.createElement('div');
      container.style.visibility = 'hidden';
      container.style.position = 'absolute';
      document.body.appendChild(container);

      // Create a temporary span to hold the icon
      const tempSpan = document.createElement('span');
      container.appendChild(tempSpan);

      // Try to render the icon by creating it
      try {
        const icon = new LucideIcon();
        if (icon && icon.toSvgString) {
          const svgString = icon.toSvgString();
          const match = svgString.match(/<path[^>]*d="([^"]*)"[^>]*\/>/g);
          if (match) {
            const paths = match
              .map((m: string) => m.match(/d="([^"]*)"/)?.[1])
              .filter((p: string | undefined): p is string => typeof p === 'string' && p.length > 0);
            if (paths.length > 0) {
              document.body.removeChild(container);
              return paths.join(' ');
            }
          }
        }
      } catch (e) {
        // Fallback failed, continue
      }

      document.body.removeChild(container);
    } catch (e) {
      // If rendering fails, continue to the next method
    }

    // Method 3: Generate a generic path fallback based on icon name patterns
    // This is a last resort for common icons
    const iconPatterns: { [key: string]: string } = {
      'Plus': 'M12 5v14M5 12h14',
      'Minus': 'M5 12h14',
      'X': 'M18 6L6 18M6 6l12 12',
      'Check': 'M20 6L9 17l-5-5',
      'Heart': 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z',
      'Star': 'M13 2l3.29 6.71A7 7 0 0 0 20 9h7l-5.65 4.09a7 7 0 0 0 2.3 7.02L13 18l3.29-6.71A7 7 0 0 1 10 9H3l5.65-4.09A7 7 0 0 1 13 2z',
      'Smile': 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z',
    };

    if (name && iconPatterns[name]) {
      return iconPatterns[name];
    }

    return null;
  };

  const addLucideIcon = (LucideIcon: any, name?: string) => {
    const d = lucideToPathData(LucideIcon, name);
    if (!d) {
      alert(`Icon \"${name || 'Unknown'}\" is not yet supported. Try Heart, Check, Star, Smile, Plus, Minus, or X.`);
      return;
    }

    const baseSize = 100;
    const centerX = Math.round((canvasSize.width - baseSize) / 2);
    const centerY = Math.round((canvasSize.height - baseSize) / 2);

    const newElement: SvgElement = {
      id: crypto.randomUUID(),
      name: name ? `Icon: ${name}` : 'Icon',
      type: 'svg',
      content: d,
      viewBox: '0 0 24 24',
      x: centerX,
      y: centerY,
      width: baseSize,
      height: baseSize,
      rotation: 0,
      zIndex: elements.length,
      opacity: 1,
      fill: '#111827',
      stroke: 'transparent',
      strokeWidth: 0,
    };

    addToHistory([...elements, newElement]);
    setSelectedIds([newElement.id]);
  };

  const addIcon = (iconName: string) => {
    if (!ICON_EMOJI[iconName]) {
      alert(`Icon "${iconName}" not found.`);
      return;
    }

    const newElement: IconElement = {
      id: crypto.randomUUID(),
      name: `Icon: ${iconName}`,
      type: 'icon',
      iconName,
      color: '#111827',
      x: 200,
      y: 200,
      width: 100,
      height: 100,
      rotation: 0,
      zIndex: elements.length,
      opacity: 1,
    };

    addToHistory([...elements, newElement], { skipOnChange: true });
    setSelectedIds([newElement.id]);
    setIconPopoverOpen(false);

    // For now, treat icons as text-like boxes in the HTML layer so they at least
    // appear and are movable, even if they don't perfectly match the emoji
    // rendering model.
    if (htmlLayout && onHtmlLayoutChange) {
      const approxText: TextElement = {
        id: newElement.id,
        name: newElement.name,
        type: 'text',
        x: newElement.x,
        y: newElement.y,
        width: newElement.width,
        height: newElement.height,
        rotation: newElement.rotation,
        zIndex: newElement.zIndex,
        opacity: newElement.opacity,
        content: ICON_EMOJI[iconName] || iconName,
        fontSize: 32,
        fontFamily: 'Inter',
        color: newElement.color,
        textAlign: 'center',
        fontWeight: 'bold',
      } as any;
      const nextHtml = appendElementsToHtml(htmlLayout, [approxText], canvasSize);
      onHtmlLayoutChange(nextHtml);
    }
  };

  // Element Creators
  const addText = () => {
    console.log('addText');
    const newElement: TextElement = {
      id: crypto.randomUUID(),
      name: 'Text Layer',
      type: 'text',
      x: 50,
      y: 50,
      width: 200,
      height: 50,
      rotation: 0,
      zIndex: elements.length,
      opacity: 1,
      content: 'Double click to edit',
      fontSize: 24,
      fontFamily: 'Inter',
      color: '#000000',
      textAlign: 'center',
      fontWeight: 'bold'
    };
    addToHistory([...elements, newElement], { skipOnChange: true });
    setSelectedIds([newElement.id]);

    if (htmlLayout && onHtmlLayoutChange) {
      const nextHtml = appendElementsToHtml(htmlLayout, [newElement], canvasSize);
      onHtmlLayoutChange(nextHtml);
    }
  };

  const getRandomColor = () => {
    const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];
    return colors[Math.floor(Math.random() * colors.length)];
  };

  const addShape = (shapeType: 'rectangle' | 'circle' | 'star' | 'triangle' | 'diamond' | 'pentagon' | 'hexagon' | 'octagon' | 'rounded-rectangle') => {
    console.log('addShape', shapeType);
    const newElement: ShapeElement = {
      id: crypto.randomUUID(),
      name: shapeType.charAt(0).toUpperCase() + shapeType.slice(1),
      type: 'shape',
      shape: shapeType as any,
      x: 100,
      y: 100,
      width: 100,
      height: 100,
      rotation: 0,
      zIndex: elements.length,
      color: getRandomColor(),
      opacity: 1
    };
    addToHistory([...elements, newElement], { skipOnChange: true });
    setSelectedIds([newElement.id]);

    if (htmlLayout && onHtmlLayoutChange) {
      const nextHtml = appendElementsToHtml(htmlLayout, [newElement], canvasSize);
      onHtmlLayoutChange(nextHtml);
    }
  };

  const addImage = (url: string) => {
    // Load image to respect its intrinsic aspect ratio.
    const img = new Image();
    img.onload = () => {
      const iw = img.naturalWidth || img.width || 1;
      const ih = img.naturalHeight || img.height || 1;
      const aspect = iw / ih;
      const base = 220; // base area size in pixels
      let width = base;
      let height = base;
      if (aspect >= 1) {
        // landscape or square: fix width, scale height
        width = base;
        height = Math.round(base / aspect);
      } else {
        // portrait: fix height, scale width
        height = base;
        width = Math.round(base * aspect);
      }

      const newElement: LogoElement = {
        id: crypto.randomUUID(),
        name: 'Image Layer',
        type: 'image',
        src: url,
        x: 150,
        y: 150,
        width,
        height,
        rotation: 0,
        zIndex: elements.length,
        opacity: 1,
      };
      addToHistory([...elements, newElement], { skipOnChange: true });
      setSelectedIds([newElement.id]);

      if (htmlLayout && onHtmlLayoutChange) {
        const nextHtml = appendElementsToHtml(htmlLayout, [newElement], canvasSize);
        onHtmlLayoutChange(nextHtml);
      }
    };
    img.onerror = () => {
      // Fallback to square if we fail to measure
      const fallback: LogoElement = {
        id: crypto.randomUUID(),
        name: 'Image Layer',
        type: 'image',
        src: url,
        x: 150,
        y: 150,
        width: 200,
        height: 200,
        rotation: 0,
        zIndex: elements.length,
        opacity: 1,
      };
      addToHistory([...elements, fallback], { skipOnChange: true });
      setSelectedIds([fallback.id]);

      if (htmlLayout && onHtmlLayoutChange) {
        const nextHtml = appendElementsToHtml(htmlLayout, [fallback], canvasSize);
        onHtmlLayoutChange(nextHtml);
      }
    };
    img.src = url;
  };

  const addSvg = () => {
    // Adding a sample SVG path (a heart)
    const baseSize = 100;
    const centerX = Math.round((canvasSize.width - baseSize) / 2);
    const centerY = Math.round((canvasSize.height - baseSize) / 2);

    const newElement: SvgElement = {
      id: crypto.randomUUID(),
      name: 'SVG Layer',
      type: 'svg',
      content: "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z",
      viewBox: '0 0 24 24',
      x: centerX,
      y: centerY,
      width: baseSize,
      height: baseSize,
      rotation: 0,
      zIndex: elements.length,
      opacity: 1,
      fill: '#ef4444',
      stroke: '#000000',
      strokeWidth: 0,
    };
    addToHistory([...elements, newElement], { skipOnChange: true });
    setSelectedIds([newElement.id]);

    if (htmlLayout && onHtmlLayoutChange) {
      const nextHtml = appendElementsToHtml(htmlLayout, [newElement], canvasSize);
      onHtmlLayoutChange(nextHtml);
    }
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
    if (selectedIds.length === 0) return;

    // Update local elements/history without regenerating HTML from elements.
    const newElements = elements.filter(el => !selectedIds.includes(el.id));
    addToHistory(newElements, { skipOnChange: true });

    // Delete corresponding nodes from the canonical HTML by data-el-id.
    if (htmlLayout && onHtmlLayoutChange) {
      const nextHtml = deleteHtmlElementsById(htmlLayout, selectedIds);
      onHtmlLayoutChange(nextHtml);
    }

    setSelectedIds([]);
  };

  const deleteLayerById = (id: string) => {
    const newElements = elements.filter((el) => el.id !== id);
    addToHistory(newElements, { skipOnChange: true });

    if (htmlLayout && onHtmlLayoutChange) {
      const nextHtml = deleteHtmlElementsById(htmlLayout, [id]);
      onHtmlLayoutChange(nextHtml);
    }

    setSelectedIds((prev) => prev.filter((x) => x !== id));
    setOpenLayerIds((prev) => prev.filter((x) => x !== id));
  };

  // Lock/Unlock Element
  const toggleLock = (id: string) => {
    const el = elements.find(e => e.id === id);
    if (el) {
      updateElement(id, { locked: !el.locked });
    }
  };

  // Visibility Toggle
  const toggleVisibility = (id: string) => {
    const el = elements.find(e => e.id === id);
    if (el) {
      updateElement(id, { visible: el.visible === undefined ? false : !el.visible });
    }
  };

  // Layer Reorder (Drag & Drop)
  // UI requirement: "top layer" in the Layers panel = front-most on canvas.
  // Konva renders later items on top, so we keep zIndex increasing back -> front.
  const handleReorder = (newOrderTopToBottom: TemplateElement[]) => {
    const n = newOrderTopToBottom.length;

    // First item in the list should get the highest zIndex.
    const withZ = newOrderTopToBottom.map((el, idx) => ({
      ...el,
      zIndex: n - 1 - idx,
    }));

    // Store sorted back -> front for stable rendering.
    const sorted = [...withZ].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
    addToHistory(sorted);
  };
  
  // Layer Management
  const bringToFront = () => {
    if (selectedIds.length === 0) return;
    const maxZ = Math.max(...elements.map(e => e.zIndex));
    const newElements = elements.map(el => {
      if (selectedIds.includes(el.id)) {
        return { ...el, zIndex: maxZ + 1 };
      }
      return el;
    });
    addToHistory(newElements);
  };

  const sendToBack = () => {
    if (selectedIds.length === 0) return;
    const minZ = Math.min(...elements.map(e => e.zIndex));
    const newElements = elements.map(el => {
      if (selectedIds.includes(el.id)) {
        return { ...el, zIndex: minZ - 1 };
      }
      return el;
    });
    addToHistory(newElements);
  };

  // Grouping
  const groupElements = () => {
    if (selectedIds.length < 2) return;
    // For now, simpler grouping: just creating a group container is complex with current structure
    // Let's implement visual grouping via Transformer (already handled by Konva if we pass multiple nodes)
    // But user asked for "Group" button.
    // Let's create a GroupElement that contains the selected elements.
    // Actually, refactoring to hierarchical structure is risky in this step.
    // Let's simulate grouping by locking their relative positions or just allowing multi-select move (which works).
    // But for "Tree View", maybe just a visual group?
    // Let's stick to multi-selection for now as "Grouping" behavior for movement.
    // But add a "Group" button that just consoles log for now as placeholder for hierarchical feature if needed,
    // OR implementing a basic Group type:
    
    // Calculate bounding box
    const selectedEls = elements.filter(e => selectedIds.includes(e.id));
    const minX = Math.min(...selectedEls.map(e => e.x));
    const minY = Math.min(...selectedEls.map(e => e.y));
    
    // We would need to reparent them. Let's hold off on deep hierarchy refactor and focus on the UI request first.
    // The user wants "Multiple layers can be grouped to move or scale". Multi-select transformer does this.
    // We will enable multi-select transformer.
  };

  // Alignment
  const alignElements = (alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
    if (selectedIds.length < 2) return;
    const selectedEls = elements.filter(e => selectedIds.includes(e.id));
    
    let targetVal = 0;
    if (alignment === 'left') targetVal = Math.min(...selectedEls.map(e => e.x));
    if (alignment === 'right') targetVal = Math.max(...selectedEls.map(e => e.x + e.width));
    if (alignment === 'top') targetVal = Math.min(...selectedEls.map(e => e.y));
    if (alignment === 'bottom') targetVal = Math.max(...selectedEls.map(e => e.y + e.height));
    if (alignment === 'center') {
       const minX = Math.min(...selectedEls.map(e => e.x));
       const maxX = Math.max(...selectedEls.map(e => e.x + e.width));
       targetVal = (minX + maxX) / 2;
    }
    if (alignment === 'middle') {
       const minY = Math.min(...selectedEls.map(e => e.y));
       const maxY = Math.max(...selectedEls.map(e => e.y + e.height));
       targetVal = (minY + maxY) / 2;
    }

    const newElements = elements.map(el => {
      if (selectedIds.includes(el.id)) {
        if (alignment === 'left') return { ...el, x: targetVal };
        if (alignment === 'right') return { ...el, x: targetVal - el.width };
        if (alignment === 'top') return { ...el, y: targetVal };
        if (alignment === 'bottom') return { ...el, y: targetVal - el.height };
        if (alignment === 'center') return { ...el, x: targetVal - el.width / 2 };
        if (alignment === 'middle') return { ...el, y: targetVal - el.height / 2 };
      }
      return el;
    });
    addToHistory(newElements);
  };

  // Apply Filter
  const updateFilter = (filterName: keyof FilterProps, value: number) => {
    if (selectedIds.length === 0) return;
    // Apply to all selected
    const newElements = elements.map(el => {
      if (selectedIds.includes(el.id)) {
        const currentFilters = el.filters || {};
        return { ...el, filters: { ...currentFilters, [filterName]: value } };
      }
      return el;
    });
    addToHistory(newElements);
  };

  // Apply Shadow
  const updateShadow = (shadowAttrs: Partial<ShadowProps>) => {
    if (selectedIds.length === 0) return;
    const newElements = elements.map(el => {
      if (selectedIds.includes(el.id)) {
        const currentShadow = el.shadow || {
          enabled: true,
          color: '#000000',
          blur: 10,
          opacity: 0.5,
          offsetX: 5,
          offsetY: 5
        };
        return { ...el, shadow: { ...currentShadow, ...shadowAttrs, enabled: true } };
      }
      return el;
    });
    addToHistory(newElements);
  };

  const toggleShadow = (enabled: boolean) => {
    if (selectedIds.length === 0) return;
    if (enabled) {
      updateShadow({});
    } else {
       const newElements = elements.map(el => {
        if (selectedIds.includes(el.id)) {
          return { ...el, shadow: undefined };
        }
        return el;
      });
      addToHistory(newElements);
    }
  };

  // Apply Gradient
  const updateGradient = (gradAttrs: Partial<GradientProps>) => {
    if (selectedIds.length === 0) return;
    const newElements = elements.map(el => {
      if (selectedIds.includes(el.id)) {
         const currentGradient = (el as any).gradient || {
          enabled: true,
          type: 'linear',
          stops: [{ offset: 0, color: '#ff0000' }, { offset: 1, color: '#0000ff' }],
          start: { x: 0, y: 0 },
          end: { x: 100, y: 100 }
        };
        return { ...el, gradient: { ...currentGradient, ...gradAttrs, enabled: true } };
      }
      return el;
    });
    addToHistory(newElements);
  };

  const toggleGradient = (enabled: boolean) => {
    if (selectedIds.length === 0) return;
    if (enabled) {
      updateGradient({});
    } else {
       const newElements = elements.map(el => {
        if (selectedIds.includes(el.id)) {
          return { ...el, gradient: undefined };
        }
        return el;
      });
      addToHistory(newElements);
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

  const selectedElements = elements.filter(e => selectedIds.includes(e.id));
  const primarySelection = selectedElements[0]; // For single-value inputs

  // Rendering order (back -> front)
  const renderElements = React.useMemo(() => {
    return [...elements].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
  }, [elements]);

  // Layers panel order (top -> bottom, front -> back)
  const layerListElements = React.useMemo(() => {
    return [...elements].sort((a, b) => (b.zIndex ?? 0) - (a.zIndex ?? 0));
  }, [elements]);

  const handleViewportWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    // Ctrl+wheel (or trackpad pinch on many browsers) zooms.
    if (!e.ctrlKey) {
      // If not in hand (pan) tool, prevent native scrolling to avoid page scroll.
      if (activeTool !== 'hand') {
        e.preventDefault();
        return;
      }
      // Otherwise allow normal scrolling when panning.
      return;
    }
    e.preventDefault();

    const vp = canvasViewportRef.current;
    if (!vp) return;

    const oldZoom = zoom;
    const direction = e.deltaY > 0 ? -1 : 1;
    const factor = direction > 0 ? 1.08 : 1 / 1.08;
    const nextZoom = clampZoom(oldZoom * factor);
    if (nextZoom === oldZoom) return;

    // Keep the point under the cursor stable by adjusting scroll.
    const rect = vp.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;

    const scrollLeft = vp.scrollLeft;
    const scrollTop = vp.scrollTop;

    const nextScrollLeft = (scrollLeft + offsetX) * (nextZoom / oldZoom) - offsetX;
    const nextScrollTop = (scrollTop + offsetY) * (nextZoom / oldZoom) - offsetY;

    setZoom(nextZoom);

    requestAnimationFrame(() => {
      vp.scrollLeft = nextScrollLeft;
      vp.scrollTop = nextScrollTop;
    });
  };

  const handleViewportPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activeTool !== 'hand') return;
    const vp = canvasViewportRef.current;
    if (!vp) return;

    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    panStateRef.current = {
      isPanning: true,
      startX: e.clientX,
      startY: e.clientY,
      startPanX: pan.x,
      startPanY: pan.y,
    };
  };

  const handleViewportPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const state = panStateRef.current;
    if (!state?.isPanning) return;
    const vp = canvasViewportRef.current;
    if (!vp) return;

    const dx = e.clientX - state.startX;
    const dy = e.clientY - state.startY;

    const raw = {
      x: state.startPanX + dx,
      y: state.startPanY + dy,
    };
    setPan(clampPanToCanvas(raw));
  };

  const handleViewportPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activeTool !== 'hand') return;
    if (!panStateRef.current) return;
    panStateRef.current = null;
    try {
      (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  // If the active tool changes away from hand, cancel any ongoing pan state.
  useEffect(() => {
    if (activeTool !== 'hand') {
      panStateRef.current = null;
    }
  }, [activeTool]);

  const hasMultiSelection = selectedIds.length > 1;

  // Helper: apply a transform change coming from numeric inputs (Layout panel)
  const applyTransformFromInputs = (id: string, partial: Partial<DomTransform>) => {
    if (!htmlLayout || !onHtmlLayoutChange) return;
    const el = elements.find((e) => e.id === id);
    if (!el) return;

    const next: DomTransform = {
      id,
      x: partial.x ?? el.x,
      y: partial.y ?? el.y,
      width: partial.width ?? el.width,
      height: partial.height ?? el.height,
      rotation: partial.rotation ?? el.rotation ?? 0,
    };

    const nextHtml = updateHtmlForTransforms(htmlLayout, [next]);
    onHtmlLayoutChange(nextHtml);
  };

  // Keyboard shortcuts: delete selection, nudge with arrows, undo/redo.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) {
        return;
      }

      if ((e.key === "Delete" || e.key === "Backspace") && selectedIds.length > 0) {
        e.preventDefault();
        deleteElement();
        return;
      }

      if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown") {
        if (selectedIds.length === 0) return;
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        let dx = 0;
        let dy = 0;
        if (e.key === "ArrowLeft") dx = -step;
        if (e.key === "ArrowRight") dx = step;
        if (e.key === "ArrowUp") dy = -step;
        if (e.key === "ArrowDown") dy = step;

        const moved = elements.map((el) => {
          if (!selectedIds.includes(el.id)) return el;
          if (el.locked) return el;
          return {
            ...el,
            x: el.x + dx,
            y: el.y + dy,
          };
        });
        addToHistory(moved);
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [elements, selectedIds, deleteElement, addToHistory, undo, redo]);

  return (
    <div className="flex flex-col md:flex-row h-full bg-[#1e1e1e] overflow-hidden text-white font-sans">
      
      {/* LEFT TOOLBAR (mobile: horizontal bottom bar) */}
      <div className="order-2 md:order-1 w-full md:w-16 bg-[#252526] border-t md:border-t-0 md:border-r border-[#3e3e42] flex flex-row md:flex-col items-center justify-start md:justify-start py-2 md:py-4 px-2 md:px-0 gap-3 md:gap-4 z-10 overflow-visible">
        <div className="mb-4 flex flex-col items-center gap-2">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
            <Palette className="text-white" size={20} />
          </div>
        </div>

        <ToolButton icon={<MousePointer2 size={20} />} active={activeTool === 'select'} onClick={() => setActiveTool('select')} label="Select" />
        <ToolButton icon={<Hand size={20} />} active={activeTool === 'hand'} onClick={() => setActiveTool('hand')} label="Hand" />
        <ToolButton icon={<Type size={20} />} onClick={addText} label="Text" />
        <Popover open={shapesPopoverOpen} onOpenChange={setShapesPopoverOpen}>
          <PopoverTrigger asChild>
            <div>
              <ToolButton icon={<Square size={20} />} label="Shapes" />
            </div>
          </PopoverTrigger>
          <PopoverContent side="right" align="start" className="w-48 bg-[#252526] border-[#3e3e42] text-white p-3 overflow-hidden flex flex-col">
            <div className="text-xs text-gray-300 mb-2 font-semibold">Shapes</div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => { addShape('rectangle'); setShapesPopoverOpen(false); }}
                className="h-12 rounded flex items-center justify-center bg-[#3e3e42] hover:bg-[#4e4e52] text-gray-100 shrink-0"
                title="Rectangle"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="4" y="6" width="16" height="12" rx="1"/>
                </svg>
              </button>
              <button
                type="button"
                onClick={() => { addShape('circle'); setShapesPopoverOpen(false); }}
                className="h-12 rounded flex items-center justify-center bg-[#3e3e42] hover:bg-[#4e4e52] text-gray-100 shrink-0"
                title="Circle"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="12" r="8"/>
                </svg>
              </button>
              <button
                type="button"
                onClick={() => { addShape('triangle'); setShapesPopoverOpen(false); }}
                className="h-12 rounded flex items-center justify-center bg-[#3e3e42] hover:bg-[#4e4e52] text-gray-100 shrink-0"
                title="Triangle"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="12,4 20,18 4,18"/>
                </svg>
              </button>
              <button
                type="button"
                onClick={() => { addShape('star'); setShapesPopoverOpen(false); }}
                className="h-12 rounded flex items-center justify-center bg-[#3e3e42] hover:bg-[#4e4e52] text-gray-100 shrink-0"
                title="Star"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="12,2 15,10 23,10 17,15 20,23 12,18 4,23 7,15 1,10 9,10"/>
                </svg>
              </button>
              <button
                type="button"
                onClick={() => { addShape('diamond'); setShapesPopoverOpen(false); }}
                className="h-12 rounded flex items-center justify-center bg-[#3e3e42] hover:bg-[#4e4e52] text-gray-100 shrink-0"
                title="Diamond"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="12,2 22,12 12,22 2,12"/>
                </svg>
              </button>
              <button
                type="button"
                onClick={() => { addShape('pentagon'); setShapesPopoverOpen(false); }}
                className="h-12 rounded flex items-center justify-center bg-[#3e3e42] hover:bg-[#4e4e52] text-gray-100 shrink-0"
                title="Pentagon"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="12,2 22,9 18,21 6,21 2,9"/>
                </svg>
              </button>
              <button
                type="button"
                onClick={() => { addShape('hexagon'); setShapesPopoverOpen(false); }}
                className="h-12 rounded flex items-center justify-center bg-[#3e3e42] hover:bg-[#4e4e52] text-gray-100 shrink-0"
                title="Hexagon"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="20,10 20,14 12,18 4,14 4,10 12,6"/>
                </svg>
              </button>
              <button
                type="button"
                onClick={() => { addShape('octagon'); setShapesPopoverOpen(false); }}
                className="h-12 rounded flex items-center justify-center bg-[#3e3e42] hover:bg-[#4e4e52] text-gray-100 shrink-0"
                title="Octagon"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="8,3 16,3 21,8 21,16 16,21 8,21 3,16 3,8"/>
                </svg>
              </button>
              <button
                type="button"
                onClick={() => { addShape('rounded-rectangle'); setShapesPopoverOpen(false); }}
                className="h-12 rounded flex items-center justify-center bg-[#3e3e42] hover:bg-[#4e4e52] text-gray-100 shrink-0 col-span-2"
                title="Rounded Rectangle"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="3" y="5" width="18" height="14" rx="3" ry="3"/>
                </svg>
              </button>
            </div>
          </PopoverContent>
        </Popover>
        <Popover open={iconPopoverOpen} onOpenChange={setIconPopoverOpen}>
          <PopoverTrigger asChild>
            <div>
              <ToolButton icon={<Star size={20} />} label="Icons" />
            </div>
          </PopoverTrigger>
          <PopoverContent side="right" align="start" className="w-72 h-44 bg-[#252526] border-[#3e3e42] text-white p-3 overflow-hidden flex flex-col">
            <div className="text-xs text-gray-300 mb-2 font-semibold">Icons</div>
            <div className="grid grid-cols-6 gap-2 overflow-y-auto overflow-x-hidden flex-1 pr-2 scrollbar-thin scrollbar-thumb-[#5e5e62] scrollbar-track-transparent [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-500 [&::-webkit-scrollbar-thumb:hover]:bg-gray-400">
              {LUCIDE_ICON_CHOICES.map(({ name }) => (
                <button
                  key={name}
                  type="button"
                  title={name}
                  onClick={() => addIcon(name)}
                  className="h-9 w-9 rounded flex items-center justify-center bg-[#3e3e42] hover:bg-[#4e4e52] text-gray-100 text-lg shrink-0"
                >
                  {ICON_EMOJI[name] || '❓'}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
        <ToolButton icon={<Hexagon size={20} />} onClick={addSvg} label="SVG" />
        
        <label className="cursor-pointer">
          <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
          <div className="w-10 h-10 rounded-md flex items-center justify-center hover:bg-[#3e3e42] text-gray-400 hover:text-white transition-colors">
            <ImageIcon size={20} />
          </div>
        </label>
        
        <div className="hidden md:block flex-1" />

        <AIModelSelector />
      </div>

      {/* CANVAS AREA */}
      <div className="order-1 md:order-2 flex-1 bg-[#1e1e1e] relative overflow-hidden flex flex-col p-2 md:p-4 gap-2 md:gap-4 min-h-[45vh] md:min-h-0">
        {/* Canvas controls */}
        <div className="flex items-center justify-between gap-3 bg-[#252526] border border-[#3e3e42] rounded-md px-3 py-2">
          <div className="flex items-center gap-3">
            <div className="text-xs text-gray-300">Canvas</div>
            <select
              value={canvasPreset}
              onChange={(e) => setCanvasPreset(e.target.value as any)}
              className="bg-[#3e3e42] text-gray-100 text-xs rounded px-2 py-1"
              title="Canvas size"
            >
              <option value="16:9">16:9 (1280×720)</option>
              <option value="9:16">9:16 (720×1280)</option>
              <option value="1:1">1:1 (1024×1024)</option>
            </select>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1 text-xs text-gray-300 select-none">
              <input
                type="checkbox"
                checked={showGrid}
                onChange={(e) => setShowGrid(e.target.checked)}
                className="h-3 w-3 accent-blue-500"
              />
              <span>Grid</span>
            </label>

            <select
              value={gridSize}
              onChange={(e) => setGridSize(Number(e.target.value) || 10)}
              className="bg-[#3e3e42] text-gray-100 text-xs rounded px-1.5 py-0.5"
              title="Grid size (snap interval)"
            >
              <option value={5}>5px</option>
              <option value={10}>10px</option>
              <option value={20}>20px</option>
              <option value={40}>40px</option>
            </select>

            <button
              type="button"
              className="px-2 py-1 text-xs rounded bg-[#3e3e42] hover:bg-[#4e4e52] text-gray-100"
              onClick={() => setZoom((z) => clampZoom(z / 1.25))}
              title="Zoom out"
            >
              -
            </button>

            {(() => {
              const presets = [25, 50, 75, 100, 125, 150, 200, 300];
              const current = Math.round(zoom * 100);
              const options = presets.includes(current)
                ? presets
                : [...presets, current].sort((a, b) => a - b);

              return (
                <select
                  value={current}
                  onChange={(e) => setZoom(clampZoom(Number(e.target.value) / 100))}
                  className="bg-[#3e3e42] text-gray-100 text-xs rounded px-2 py-1"
                  title="Zoom"
                >
                  {options.map((pct) => (
                    <option key={pct} value={pct}>
                      {pct}%
                    </option>
                  ))}
                </select>
              );
            })()}

            <button
              type="button"
              className="px-2 py-1 text-xs rounded bg-[#3e3e42] hover:bg-[#4e4e52] text-gray-100"
              onClick={() => setZoom((z) => clampZoom(z * 1.25))}
              title="Zoom in"
            >
              +
            </button>

            <button
              type="button"
              className="px-2 py-1 text-xs rounded bg-[#3e3e42] hover:bg-[#4e4e52] text-gray-100"
              onClick={fitZoomToViewport}
              title="Fit to view"
            >
              Fit
            </button>

            {/* Ask Claude popover */}
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="px-3 py-1 text-xs rounded bg-[#6b21a8] hover:bg-[#7c3aed] text-white ml-2"
                  title="Ask Claude"
                >
                  Ask Claude
                </button>
              </PopoverTrigger>
              <PopoverContent side="bottom" align="end" className="w-80 bg-[#151515] border-[#2b2b2b] text-white p-3">
                <div className="text-sm mb-2 font-medium">Ask Claude (Puter)</div>
                <textarea value={claudePrompt} onChange={(e) => setClaudePrompt(e.target.value)} className="w-full bg-[#222] rounded px-2 py-1 text-sm text-white min-h-[80px]" />
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={async () => {
                      const enabled = localStorage.getItem('puter_enabled') === '1';
                      if (!enabled) {
                        toast.error('Puter is not enabled in Settings (⚙️)');
                        return;
                      }
                      const model = localStorage.getItem('puter_model') || 'claude-sonnet-4-5';
                      const stream = localStorage.getItem('puter_stream') === '1';
                      setClaudeResponse(null);
                      setClaudeLoading(true);
                      try {
                        if (stream) {
                          const it: any = await callPuterChat(claudePrompt, { model, stream: true });
                          let acc = '';
                          for await (const part of it) {
                            acc += part?.text ?? '';
                            setClaudeResponse(acc);
                          }
                        } else {
                          const resp: any = await callPuterChat(claudePrompt, { model, stream: false });
                          const text = resp?.message?.content?.[0]?.text ?? JSON.stringify(resp);
                          setClaudeResponse(text);
                        }
                        toast.success('Claude answered');
                      } catch (err) {
                        console.error('Claude call failed', err);
                        toast.error('Claude call failed (see console)');
                        setClaudeResponse('Error: see console');
                      } finally {
                        setClaudeLoading(false);
                      }
                    }}
                    className="px-3 py-1 rounded bg-violet-600 hover:bg-violet-700 text-white text-sm"
                    disabled={claudeLoading}
                  >
                    {claudeLoading ? 'Thinking…' : 'Send'}
                  </button>
                  <button onClick={() => { setClaudePrompt(''); setClaudeResponse(null); }} className="px-2 py-1 rounded bg-white/5 text-sm">Clear</button>
                </div>
                <div className="mt-3 text-xs text-white/60">
                  <div className="font-semibold">Note</div>
                  <div>Uses Puter.js (Claude). Puter is user-pays — enabling it will make client-side calls that may incur cost.</div>
                </div>
                <div className="mt-3 bg-[#0b0b0b] p-2 rounded text-sm max-h-40 overflow-auto">
                  {claudeResponse ? <pre className="whitespace-pre-wrap text-sm">{claudeResponse}</pre> : <div className="text-xs text-white/40">No answer yet</div>}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Canvas viewport: square area on the left with white canvas centered inside */}
        <div
          ref={canvasViewportRef}
          className={`relative w-full h-[60vh] overflow-hidden ${activeTool === 'hand' ? 'cursor-grab' : 'cursor-default'}`}
          onMouseDown={(e) => {
            // Clicking the grey area around the canvas should unselect everything.
            const frame = canvasFrameRef.current;
            if (!frame) return;
            if (!frame.contains(e.target as any)) {
              setSelectedIds([]);
            }
          }}
          onWheel={handleViewportWheel}
          onPointerDown={handleViewportPointerDown}
          onPointerMove={handleViewportPointerMove}
          onPointerUp={handleViewportPointerUp}
        >
          <div
            ref={(el) => {
              canvasFrameRef.current = el;
              onCanvasElementRefChange?.(el);
            }}
            className="shadow-2xl border border-[#3e3e42] bg-white relative overflow-hidden"
            style={{
              width: canvasSize.width,
              height: canvasSize.height,
              boxSizing: "content-box",
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "top left",
            }}
          >
            {/* Grid overlay */}
            {showGrid && (
              <div
                className="absolute inset-0 pointer-events-none opacity-40"
                style={{
                  backgroundImage:
                    "linear-gradient(to right, rgba(148,163,184,0.35) 1px, transparent 1px)," +
                    "linear-gradient(to bottom, rgba(148,163,184,0.35) 1px, transparent 1px)",
                  backgroundSize: `${gridSize}px ${gridSize}px`,
                }}
              />
            )}

            {/* Render the canonical HTML layout as the base content so Editor matches HTML mode exactly */}
            {htmlLayout && (
              <div
                className="absolute inset-0"
                style={{ pointerEvents: 'none' }}
                dangerouslySetInnerHTML={{ __html: htmlLayout }}
              />
            )}

            {/* Overlay transform boxes (frame + handles only) */}
            {renderElements.map((el) => {
              if (el.visible === false) return null;

              const transform: DomTransform = {
                id: el.id,
                x: el.x,
                y: el.y,
                width: el.width,
                height: el.height,
                rotation: el.rotation || 0,
              };

              const isSelected = selectedIds.includes(el.id);
              const showSingleHandles = !hasMultiSelection && isSelected;

              const handleUpdate = (updates: Partial<DomTransform>) => {
                // Compute the new transform for this element.
                const nextTransform: DomTransform = {
                  id: el.id,
                  x: updates.x ?? el.x,
                  y: updates.y ?? el.y,
                  width: updates.width ?? el.width,
                  height: updates.height ?? el.height,
                  rotation: updates.rotation ?? el.rotation ?? 0,
                } as DomTransform;

                // Update local element history without triggering a full elements->HTML rebuild.
                const updatedElements = elements.map((e) =>
                  e.id === el.id
                    ? {
                        ...e,
                        x: nextTransform.x,
                        y: nextTransform.y,
                        width: nextTransform.width,
                        height: nextTransform.height,
                        rotation: nextTransform.rotation,
                      }
                    : e,
                );
                addToHistory(updatedElements, { skipOnChange: true });

                // Update the canonical HTML layout in-place so the visual HTML stays intact.
                if (htmlLayout && onHtmlLayoutChange) {
                  const nextHtml = updateHtmlForTransforms(htmlLayout, [
                    {
                      id: nextTransform.id,
                      x: nextTransform.x,
                      y: nextTransform.y,
                      width: nextTransform.width,
                      height: nextTransform.height,
                      rotation: nextTransform.rotation,
                    },
                  ]);
                  onHtmlLayoutChange(nextHtml);
                }
              };

              return (
                <TransformBox
                  key={el.id}
                  transform={transform}
                  isSelected={showSingleHandles}
                  scale={zoom}
                  snapToGrid={showGrid}
                  gridSize={gridSize}
                  enableRotate={true}
                  onSelect={() => selectSingle(el.id)}
                  onUpdate={handleUpdate}
                >
                  {/* Empty child: HTML is rendered separately, this just shows selection/handles */}
                  <></>
                </TransformBox>
              );
            })}

            {/* Group transform box for multi-select (move & scale together) */}
            {selectedIds.length > 1 && (() => {
              const selectedEls = renderElements.filter((e) => selectedIds.includes(e.id));
              if (selectedEls.length < 2) return null;

              const minX = Math.min(...selectedEls.map((e) => e.x));
              const minY = Math.min(...selectedEls.map((e) => e.y));
              const maxX = Math.max(...selectedEls.map((e) => e.x + e.width));
              const maxY = Math.max(...selectedEls.map((e) => e.y + e.height));

              const groupTransform: DomTransform = {
                id: "group",
                x: minX,
                y: minY,
                width: maxX - minX,
                height: maxY - minY,
                rotation: 0,
              };

              const handleGroupUpdate = (updates: Partial<DomTransform>) => {
                const els = elements.filter((e) => selectedIds.includes(e.id));
                if (els.length < 2) return;

                const gMinX = Math.min(...els.map((e) => e.x));
                const gMinY = Math.min(...els.map((e) => e.y));
                const gMaxX = Math.max(...els.map((e) => e.x + e.width));
                const gMaxY = Math.max(...els.map((e) => e.y + e.height));
                const gWidth = gMaxX - gMinX || 1;
                const gHeight = gMaxY - gMinY || 1;

                const newX = updates.x ?? gMinX;
                const newY = updates.y ?? gMinY;
                const newW = updates.width ?? gWidth;
                const newH = updates.height ?? gHeight;

                const dx = newX - gMinX;
                const dy = newY - gMinY;
                const sx = newW / gWidth;
                const sy = newH / gHeight;

                const updated = elements.map((el) => {
                  if (!selectedIds.includes(el.id)) return el;
                  const relX = el.x - gMinX;
                  const relY = el.y - gMinY;
                  return {
                    ...el,
                    x: newX + relX * sx,
                    y: newY + relY * sy,
                    width: el.width * sx,
                    height: el.height * sy,
                  };
                });

                addToHistory(updated, { skipOnChange: true });

                // Also update the underlying HTML for each selected element.
                if (htmlLayout && onHtmlLayoutChange) {
                  const transforms = elements
                    .filter((el) => selectedIds.includes(el.id))
                    .map((el) => {
                      const relX = el.x - gMinX;
                      const relY = el.y - gMinY;
                      const nextX = newX + relX * sx;
                      const nextY = newY + relY * sy;
                      const nextW = el.width * sx;
                      const nextH = el.height * sy;
                      return {
                        id: el.id,
                        x: nextX,
                        y: nextY,
                        width: nextW,
                        height: nextH,
                        rotation: el.rotation || 0,
                      };
                    });

                  const nextHtml = updateHtmlForTransforms(htmlLayout, transforms as any);
                  onHtmlLayoutChange(nextHtml);
                }
              };

              return (
                <TransformBox
                  key="group-box"
                  transform={groupTransform}
                  isSelected={true}
                  scale={zoom}
                  snapToGrid={showGrid}
                  gridSize={gridSize}
                  enableRotate={false}
                  onSelect={() => {}}
                  onUpdate={handleGroupUpdate}
                >
                  {/* Empty child: this box only shows frame + handles */}
                  <></>
                </TransformBox>
              );
            })()}
          </div>
        </div>
      </div>

      {/* RIGHT LAYERS & PROPERTIES PANEL (mobile: bottom sheet area) */}
      <div className="order-3 md:order-3 w-full md:w-80 bg-[#252526] border-t md:border-t-0 md:border-l border-[#3e3e42] flex flex-col md:h-[70vh] flex-1 min-h-0">
        <div className="p-4 border-b border-[#3e3e42] flex justify-between items-center bg-[#2d2d30]">
          <h2 className="font-semibold text-sm text-gray-200">Layers</h2>
          <div className="flex gap-2">
            <button className="p-1 hover:bg-[#3e3e42] rounded text-gray-400 hover:text-white" title="Align Left" onClick={() => alignElements('left')}><AlignLeft size={16}/></button>
            <button className="p-1 hover:bg-[#3e3e42] rounded text-gray-400 hover:text-white" title="Align Center" onClick={() => alignElements('center')}><AlignCenter size={16}/></button>
            <button className="p-1 hover:bg-[#3e3e42] rounded text-gray-400 hover:text-white" title="Align Right" onClick={() => alignElements('right')}><AlignRight size={16}/></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-0">
          {elements.length === 0 && (
            <div className="text-center text-gray-500 text-sm py-10">No layers added</div>
          )}
          
          <Reorder.Group axis="y" values={layerListElements} onReorder={handleReorder} className="space-y-1">
          {layerListElements.map((el) => {
            const isSelected = selectedIds.includes(el.id);
            const isOpen = openLayerIds.includes(el.id);
            
            return (
              <Reorder.Item key={el.id} value={el}>
                <Accordion
                  type="single"
                  collapsible
                  className="w-full bg-[#333336] rounded-md overflow-hidden border border-[#3e3e42]"
                  value={isOpen ? "item-1" : ""}
                  onValueChange={(v) => {
                    const nextOpen = v === "item-1";
                    if (nextOpen) {
                      setOpenLayerIds([el.id]);
                    } else {
                      setOpenLayerIds([]);
                    }
                  }}
                >
                  <AccordionItem value="item-1" className="border-0">
                    <div
                      className={`flex items-center px-2 py-2 gap-2 ${isSelected ? 'bg-[#3b82f6]/20' : 'hover:bg-[#3e3e42]'}`}
                      onClick={() => selectSingle(el.id)}
                    >
                      <div className="cursor-grab active:cursor-grabbing text-gray-500 hover:text-gray-300" onPointerDown={(e) => e.stopPropagation()}>
                        <GripVertical size={14} />
                      </div>

                      <label
                        className="flex items-center"
                        onClick={(e) => e.stopPropagation()}
                        title="Select layer"
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => toggleSelected(el.id, e.target.checked)}
                          className="h-4 w-4 accent-blue-600"
                        />
                      </label>
                      
                      <div className="flex-1 text-xs font-medium text-gray-200 truncate flex items-center gap-2">
                        {el.type === 'text' && <Type size={12} className="text-blue-400"/>}
                        {el.type === 'shape' && <Square size={12} className="text-green-400"/>}
                        {el.type === 'image' && <ImageIcon size={12} className="text-purple-400"/>}
                        {el.name || 'Untitled Layer'}
                      </div>

                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                         <button onClick={() => toggleVisibility(el.id)} className={`p-1 rounded hover:bg-[#4e4e52] ${el.visible === false ? 'text-gray-600' : 'text-gray-400'}`}>
                           {el.visible === false ? <EyeOff size={14}/> : <Eye size={14}/>}
                         </button>
                         <button
                           onClick={() => deleteLayerById(el.id)}
                           className="p-1 rounded hover:bg-red-900/30 text-gray-400 hover:text-red-400"
                           title="Delete layer"
                         >
                           <Trash2 size={14} />
                         </button>
                         <button onClick={() => toggleLock(el.id)} className={`p-1 rounded hover:bg-[#4e4e52] ${el.locked ? 'text-red-400' : 'text-gray-400'}`}>
                           {el.locked ? <Lock size={14}/> : <Unlock size={14}/>}
                         </button>
                         <AccordionTrigger className="p-1 hover:bg-[#4e4e52] rounded text-gray-400 w-6 h-6 flex items-center justify-center" />
                      </div>
                    </div>

                    <AccordionContent className="bg-[#252526] p-4 border-t border-[#3e3e42]">
                      {/* Nested Properties for this specific layer */}
                      
                      {/* Layout */}
                      <div className="mb-4">
                        <h4 className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-2">Layout</h4>
                        <div className="grid grid-cols-2 gap-2 mb-2">
                          <div>
                            <span className="text-xs text-gray-500 block mb-1">X</span>
                            <input
                              type="number"
                              value={Math.round(el.x)}
                              onChange={(e) => applyTransformFromInputs(el.id, { x: Number(e.target.value) })}
                              className="w-full bg-[#3e3e42] rounded px-2 py-1 text-sm"
                            />
                          </div>
                          <div>
                            <span className="text-xs text-gray-500 block mb-1">Y</span>
                            <input
                              type="number"
                              value={Math.round(el.y)}
                              onChange={(e) => applyTransformFromInputs(el.id, { y: Number(e.target.value) })}
                              className="w-full bg-[#3e3e42] rounded px-2 py-1 text-sm"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <span className="text-xs text-gray-500 block mb-1">W</span>
                            <input
                              type="number"
                              value={Math.round(el.width)}
                              onChange={(e) => applyTransformFromInputs(el.id, { width: Number(e.target.value) })}
                              className="w-full bg-[#3e3e42] rounded px-2 py-1 text-sm"
                            />
                          </div>
                          <div>
                            <span className="text-xs text-gray-500 block mb-1">H</span>
                            <input
                              type="number"
                              value={Math.round(el.height)}
                              onChange={(e) => applyTransformFromInputs(el.id, { height: Number(e.target.value) })}
                              className="w-full bg-[#3e3e42] rounded px-2 py-1 text-sm"
                            />
                          </div>
                        </div>
                      </div>

        {/* Styles */}
                      <div className="mb-4">
                        <h4 className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-2">Style</h4>

                        {htmlLayout && onHtmlLayoutChange && (() => {
                          const styleStr = el.style || '';

                          const parseStyle = (input: string): Record<string, string> => {
                            const map: Record<string, string> = {};
                            input.split(';').forEach((part) => {
                              const trimmed = part.trim();
                              if (!trimmed) return;
                              const idx = trimmed.indexOf(':');
                              if (idx === -1) return;
                              const key = trimmed.slice(0, idx).trim();
                              const value = trimmed.slice(idx + 1).trim();
                              if (!key) return;
                              map[key] = value;
                            });
                            return map;
                          };

                          const styleMap = parseStyle(styleStr);
                          const getCss = (prop: string) => styleMap[prop] || '';

                          const applyCssPatch = (patch: Record<string, string | null>) => {
                            const nextMap: Record<string, string> = { ...styleMap };
                            for (const [key, value] of Object.entries(patch)) {
                              if (!value) {
                                delete nextMap[key];
                              } else {
                                nextMap[key] = value;
                              }
                            }
                            const nextStyle = Object.entries(nextMap)
                              .map(([k, v]) => `${k}:${v}`)
                              .join(';');
                            const nextHtml = updateHtmlRawStyle(htmlLayout, el.id, nextStyle);
                            onHtmlLayoutChange(nextHtml);
                          };

                          const display = getCss('display');
                          const position = getCss('position');
                          const padding = getCss('padding');
                          const margin = getCss('margin');

                          const bgColor = getCss('background-color') || getCss('background');
                          const borderRadius = getCss('border-radius');

                          const colorCss = getCss('color');
                          const fontSizeCss = getCss('font-size');
                          const fontWeightCss = getCss('font-weight');
                          const textAlignCss = getCss('text-align');
                          const textTransformCss = getCss('text-transform');
                          const lineHeightCss = getCss('line-height');
                          const letterSpacingCss = getCss('letter-spacing');

                          const borderWidthCss = getCss('border-width');
                          const borderColorCss = getCss('border-color');
                          const borderStyleCss = getCss('border-style');

                          // Helpers to derive a reasonable hex color preview for <input type="color">
                          const rgbStringToHex = (rgb: string): string | null => {
                            const m = rgb.trim().match(/^rgba?\(([^)]+)\)/i);
                            if (!m) return null;
                            const parts = m[1]
                              .split(',')
                              .map((p) => parseFloat(p.trim()))
                              .filter((n) => Number.isFinite(n));
                            if (parts.length < 3) return null;
                            const [r, g, b] = parts;
                            const to2 = (v: number) => {
                              const n = Math.max(0, Math.min(255, Math.round(v)));
                              return n.toString(16).padStart(2, '0');
                            };
                            return `#${to2(r)}${to2(g)}${to2(b)}`;
                          };

                          const cssColorToHex = (value: string): string | null => {
                            if (!value) return null;
                            let v = value.trim();

                            // If it's already a hex color.
                            const directHex = v.match(/^#([0-9a-fA-F]{3,8})$/);
                            if (directHex) {
                              const hex = directHex[0];
                              if (hex.length === 4) {
                                // #rgb -> #rrggbb
                                const r = hex[1];
                                const g = hex[2];
                                const b = hex[3];
                                return `#${r}${r}${g}${g}${b}${b}`;
                              }
                              return hex.length >= 7 ? hex.slice(0, 7) : hex;
                            }

                            // If inside a gradient, try to pick the first color token.
                            if (/gradient\(/i.test(v)) {
                              const hexMatch = v.match(/#([0-9a-fA-F]{3,8})/);
                              if (hexMatch) {
                                return cssColorToHex(hexMatch[0]);
                              }
                              const rgbMatch = v.match(/rgba?\([^)]*\)/i);
                              if (rgbMatch) {
                                return rgbStringToHex(rgbMatch[0]);
                              }
                            }

                            // rgb/rgba
                            if (/^rgba?\(/i.test(v)) {
                              return rgbStringToHex(v);
                            }

                            // Fallback: use browser to resolve named colors etc.
                            if (typeof document !== 'undefined') {
                              try {
                                const el = document.createElement('div');
                                el.style.color = v;
                                el.style.position = 'absolute';
                                el.style.visibility = 'hidden';
                                document.body.appendChild(el);
                                const computed = window.getComputedStyle(el).color;
                                document.body.removeChild(el);
                                return rgbStringToHex(computed) ?? null;
                              } catch {
                                // ignore
                              }
                            }

                            return null;
                          };

                          const justifyContent = getCss('justify-content');
                          const alignItems = getCss('align-items');
                          const flexDirection = getCss('flex-direction');

                          const parsePx = (value: string): string => {
                            const n = parseFloat(value);
                            return Number.isFinite(n) ? String(n) : '';
                          };

                          return (
                            <>
                              {/* CSS Visualizer controls */}
                              <div className="mb-3 mt-1 pt-2 border-t border-[#3e3e42] space-y-2">
                                <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">CSS Visualizer</div>

                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <span className="text-xs text-gray-500 block mb-1">Display</span>
                                    <select
                                      value={display}
                                      onChange={(e) => applyCssPatch({ display: e.target.value || null })}
                                      className="w-full bg-[#3e3e42] rounded px-2 py-1 text-xs"
                                    >
                                      <option value="">(default)</option>
                                      <option value="block">block</option>
                                      <option value="inline-block">inline-block</option>
                                      <option value="flex">flex</option>
                                      <option value="grid">grid</option>
                                      <option value="none">none</option>
                                    </select>
                                  </div>
                                  <div>
                                    <span className="text-xs text-gray-500 block mb-1">Position</span>
                                    <select
                                      value={position}
                                      onChange={(e) => applyCssPatch({ position: e.target.value || null })}
                                      className="w-full bg-[#3e3e42] rounded px-2 py-1 text-xs"
                                    >
                                      <option value="">(default)</option>
                                      <option value="absolute">absolute</option>
                                      <option value="relative">relative</option>
                                      <option value="fixed">fixed</option>
                                      <option value="sticky">sticky</option>
                                      <option value="static">static</option>
                                    </select>
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <span className="text-xs text-gray-500 block mb-1">Padding (all)</span>
                                    <input
                                      type="number"
                                      value={parsePx(padding)}
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        applyCssPatch({ padding: v ? `${v}px` : null });
                                      }}
                                      className="w-full bg-[#3e3e42] rounded px-2 py-1 text-xs"
                                    />
                                  </div>
                                  <div>
                                    <span className="text-xs text-gray-500 block mb-1">Margin (all)</span>
                                    <input
                                      type="number"
                                      value={parsePx(margin)}
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        applyCssPatch({ margin: v ? `${v}px` : null });
                                      }}
                                      className="w-full bg-[#3e3e42] rounded px-2 py-1 text-xs"
                                    />
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <span className="text-xs text-gray-500 block mb-1">Background</span>
                                      <input
                                      type="color"
                                      value={cssColorToHex(bgColor) ?? '#000000'}
                                      onChange={(e) => applyCssPatch({ 'background-color': e.target.value })}
                                      className="h-7 w-full bg-[#3e3e42] rounded cursor-pointer"
                                      />
                                  </div>
                                  <div>
                                    <span className="text-xs text-gray-500 block mb-1">Border Radius</span>
                                    <input
                                      type="number"
                                      value={parsePx(borderRadius)}
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        applyCssPatch({ 'border-radius': v ? `${v}px` : null });
                                      }}
                                      className="w-full bg-[#3e3e42] rounded px-2 py-1 text-xs"
                                    />
                                  </div>
                                </div>

                                {/* Typography */}
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <span className="text-xs text-gray-500 block mb-1">Text Color</span>
                                      <input
                                      type="color"
                                      value={cssColorToHex(colorCss) ?? '#000000'}
                                      onChange={(e) => applyCssPatch({ color: e.target.value })}
                                      className="h-7 w-full bg-[#3e3e42] rounded cursor-pointer"
                                      />
                                  </div>
                                  <div>
                                    <span className="text-xs text-gray-500 block mb-1">Font Size</span>
                                    <input
                                      type="number"
                                      value={parsePx(fontSizeCss)}
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        applyCssPatch({ 'font-size': v ? `${v}px` : null });
                                      }}
                                      className="w-full bg-[#3e3e42] rounded px-2 py-1 text-xs"
                                    />
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <span className="text-xs text-gray-500 block mb-1">Font Weight</span>
                                    <select
                                      value={fontWeightCss}
                                      onChange={(e) => applyCssPatch({ 'font-weight': e.target.value || null })}
                                      className="w-full bg-[#3e3e42] rounded px-2 py-1 text-xs"
                                    >
                                      <option value="">(default)</option>
                                      <option value="300">300</option>
                                      <option value="400">400</option>
                                      <option value="500">500</option>
                                      <option value="600">600</option>
                                      <option value="700">700</option>
                                      <option value="800">800</option>
                                      <option value="900">900</option>
                                      <option value="bold">bold</option>
                                      <option value="normal">normal</option>
                                    </select>
                                  </div>
                                  <div>
                                    <span className="text-xs text-gray-500 block mb-1">Line Height</span>
                                    <input
                                      type="number"
                                      value={parsePx(lineHeightCss)}
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        applyCssPatch({ 'line-height': v ? `${v}px` : null });
                                      }}
                                      className="w-full bg-[#3e3e42] rounded px-2 py-1 text-xs"
                                    />
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <span className="text-xs text-gray-500 block mb-1">Text Align</span>
                                    <select
                                      value={textAlignCss}
                                      onChange={(e) => applyCssPatch({ 'text-align': e.target.value || null })}
                                      className="w-full bg-[#3e3e42] rounded px-2 py-1 text-xs"
                                    >
                                      <option value="">(default)</option>
                                      <option value="left">left</option>
                                      <option value="center">center</option>
                                      <option value="right">right</option>
                                      <option value="justify">justify</option>
                                    </select>
                                  </div>
                                  <div>
                                    <span className="text-xs text-gray-500 block mb-1">Transform</span>
                                    <select
                                      value={textTransformCss}
                                      onChange={(e) => applyCssPatch({ 'text-transform': e.target.value || null })}
                                      className="w-full bg-[#3e3e42] rounded px-2 py-1 text-xs"
                                    >
                                      <option value="">(default)</option>
                                      <option value="uppercase">uppercase</option>
                                      <option value="lowercase">lowercase</option>
                                      <option value="capitalize">capitalize</option>
                                    </select>
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <span className="text-xs text-gray-500 block mb-1">Letter Spacing</span>
                                    <input
                                      type="number"
                                      value={parsePx(letterSpacingCss)}
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        applyCssPatch({ 'letter-spacing': v ? `${v}px` : null });
                                      }}
                                      className="w-full bg-[#3e3e42] rounded px-2 py-1 text-xs"
                                    />
                                  </div>
                                  <div>
                                    <span className="text-xs text-gray-500 block mb-1">Opacity</span>
                                    <input
                                      type="number"
                                      min={0}
                                      max={1}
                                      step={0.05}
                                      value={getCss('opacity') || ''}
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        applyCssPatch({ opacity: v || null });
                                      }}
                                      className="w-full bg-[#3e3e42] rounded px-2 py-1 text-xs"
                                    />
                                  </div>
                                </div>

                                {/* Border */}
                                <div className="grid grid-cols-3 gap-2">
                                  <div>
                                    <span className="text-xs text-gray-500 block mb-1">Border W</span>
                                    <input
                                      type="number"
                                      value={parsePx(borderWidthCss)}
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        applyCssPatch({ 'border-width': v ? `${v}px` : null });
                                      }}
                                      className="w-full bg-[#3e3e42] rounded px-2 py-1 text-xs"
                                    />
                                  </div>
                                  <div>
                                    <span className="text-xs text-gray-500 block mb-1">Border Col</span>
                                      <input
                                      type="color"
                                      value={cssColorToHex(borderColorCss) ?? '#000000'}
                                      onChange={(e) => applyCssPatch({ 'border-color': e.target.value })}
                                      className="h-7 w-full bg-[#3e3e42] rounded cursor-pointer"
                                      />
                                  </div>
                                  <div>
                                    <span className="text-xs text-gray-500 block mb-1">Border Style</span>
                                    <select
                                      value={borderStyleCss}
                                      onChange={(e) => applyCssPatch({ 'border-style': e.target.value || null })}
                                      className="w-full bg-[#3e3e42] rounded px-2 py-1 text-xs"
                                    >
                                      <option value="">(default)</option>
                                      <option value="solid">solid</option>
                                      <option value="dashed">dashed</option>
                                      <option value="dotted">dotted</option>
                                      <option value="double">double</option>
                                    </select>
                                  </div>
                                </div>

                                <div className="grid grid-cols-3 gap-2 mt-2">
                                  <div>
                                    <span className="text-xs text-gray-500 block mb-1">Flex Dir</span>
                                    <select
                                      value={flexDirection}
                                      onChange={(e) => applyCssPatch({ 'flex-direction': e.target.value || null })}
                                      className="w-full bg-[#3e3e42] rounded px-2 py-1 text-xs"
                                    >
                                      <option value="">(default)</option>
                                      <option value="row">row</option>
                                      <option value="row-reverse">row-reverse</option>
                                      <option value="column">column</option>
                                      <option value="column-reverse">column-reverse</option>
                                    </select>
                                  </div>
                                  <div>
                                    <span className="text-xs text-gray-500 block mb-1">Justify</span>
                                    <select
                                      value={justifyContent}
                                      onChange={(e) => applyCssPatch({ 'justify-content': e.target.value || null })}
                                      className="w-full bg-[#3e3e42] rounded px-2 py-1 text-xs"
                                    >
                                      <option value="">(default)</option>
                                      <option value="flex-start">flex-start</option>
                                      <option value="center">center</option>
                                      <option value="flex-end">flex-end</option>
                                      <option value="space-between">space-between</option>
                                      <option value="space-around">space-around</option>
                                      <option value="space-evenly">space-evenly</option>
                                    </select>
                                  </div>
                                  <div>
                                    <span className="text-xs text-gray-500 block mb-1">Align</span>
                                    <select
                                      value={alignItems}
                                      onChange={(e) => applyCssPatch({ 'align-items': e.target.value || null })}
                                      className="w-full bg-[#3e3e42] rounded px-2 py-1 text-xs"
                                    >
                                      <option value="">(default)</option>
                                      <option value="flex-start">flex-start</option>
                                      <option value="center">center</option>
                                      <option value="flex-end">flex-end</option>
                                      <option value="stretch">stretch</option>
                                      <option value="baseline">baseline</option>
                                    </select>
                                  </div>
                                </div>

                                {/* Raw CSS fallback */}
                                <div className="mt-2">
                                  <span className="text-xs text-gray-500 block mb-1">Custom CSS (inline style)</span>
                                  <textarea
                                    value={styleStr}
                                    onChange={(e) => {
                                      const nextStyle = e.target.value;
                                      const nextHtml = updateHtmlRawStyle(htmlLayout, el.id, nextStyle);
                                      onHtmlLayoutChange(nextHtml);
                                    }}
                                    className="w-full bg-[#3e3e42] rounded px-2 py-1 text-xs font-mono min-h-[60px]"
                                    spellCheck={false}
                                  />
                                </div>
                              </div>
                            </>
                          );
                        })()}

                        {/* Opacity (all layer types) */}
                        <div className="mb-3">
                          <div className="flex justify-between">
                            <span className="text-xs text-gray-400">Opacity</span>
                            <span className="text-xs text-gray-500">{Math.round(((el.opacity ?? 1) as number) * 100)}%</span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.05}
                            value={el.opacity ?? 1}
                            onChange={(e) => updateElement(el.id, { opacity: Number(e.target.value) })}
                            className="w-full template-range"
                          />
                        </div>
                        {el.type === 'text' && (
                          <div className="space-y-3">
                            <textarea
                              value={(el as TextElement).content}
                              onChange={(e) => {
                                if (htmlLayout && onHtmlLayoutChange) {
                                  const nextHtml = updateHtmlTextContent(htmlLayout, el.id, e.target.value);
                                  onHtmlLayoutChange(nextHtml);
                                }
                              }}
                              className="w-full bg-[#3e3e42] rounded px-2 py-1 text-sm min-h-[50px]"
                            />
                            <div className="flex gap-2 items-center">
                              <input type="color" value={(el as TextElement).color} onChange={(e) => updateElement(el.id, { color: e.target.value })} className="h-6 w-8 bg-transparent rounded cursor-pointer"/>
                              <span className="text-xs text-gray-400">Color</span>
                            </div>
                            <div>
                               <span className="text-xs text-gray-500 block mb-1">Size: {(el as TextElement).fontSize}px</span>
                               <input type="range" min="8" max="120" value={(el as TextElement).fontSize} onChange={(e) => updateElement(el.id, { fontSize: Number(e.target.value) })} className="w-full template-range"/>
                            </div>

                            {/* Font family & weight */}
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <span className="text-xs text-gray-500 block mb-1">Font</span>
                                <select
                                  value={(el as TextElement).fontFamily}
                                  onChange={(e) => updateElement(el.id, { fontFamily: e.target.value })}
                                  className="w-full bg-[#3e3e42] rounded px-2 py-1 text-xs"
                                >
                                  <option value="Inter">Inter</option>
                                  <option value="System UI">System UI</option>
                                  <option value="Arial">Arial</option>
                                  <option value="Helvetica">Helvetica</option>
                                  <option value="Georgia">Georgia</option>
                                  <option value="Times New Roman">Times New Roman</option>
                                  <option value="Poppins">Poppins</option>
                                  <option value="Roboto">Roboto</option>
                                  <option value="Open Sans">Open Sans</option>
                                  <option value="Montserrat">Montserrat</option>
                                </select>
                              </div>
                              <div>
                                <span className="text-xs text-gray-500 block mb-1">Weight</span>
                                <select
                                  value={(el as TextElement).fontWeight || '400'}
                                  onChange={(e) => updateElement(el.id, { fontWeight: e.target.value as any })}
                                  className="w-full bg-[#3e3e42] rounded px-2 py-1 text-xs"
                                >
                                  <option value="300">Light</option>
                                  <option value="400">Regular</option>
                                  <option value="500">Medium</option>
                                  <option value="600">Semi Bold</option>
                                  <option value="700">Bold</option>
                                  <option value="800">Extra Bold</option>
                                </select>
                              </div>
                            </div>
                          </div>
                        )}
                        {(el.type === 'shape' || el.type === 'svg') && (
                           <div className="flex gap-2 items-center">
                              <input type="color" value={(el as any).color || (el as any).fill} onChange={(e) => updateElement(el.id, el.type === 'shape' ? { color: e.target.value } : { fill: e.target.value })} className="h-6 w-8 bg-transparent rounded cursor-pointer"/>
                              <span className="text-xs text-gray-400">Fill Color</span>
                            </div>
                        )}

                        {el.type === 'svg' && (
                          <div className="mt-3 pt-2 border-t border-[#3e3e42] space-y-2">
                            <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">SVG</div>
                            <div>
                              <span className="text-xs text-gray-500 block mb-1">Path (d attribute)</span>
                              <textarea
                                value={(el as SvgElement).content}
                                onChange={(e) => {
                                  const d = e.target.value;
                                  updateElement(el.id, { content: d } as any);
                                  if (htmlLayout && onHtmlLayoutChange) {
                                    const nextHtml = updateHtmlSvgContent(htmlLayout, el.id, { d });
                                    onHtmlLayoutChange(nextHtml);
                                  }
                                }}
                                className="w-full bg-[#3e3e42] rounded px-2 py-1 text-xs font-mono min-h-[60px]"
                                spellCheck={false}
                              />
                            </div>
                            <div>
                              <span className="text-xs text-gray-500 block mb-1">ViewBox</span>
                              <input
                                type="text"
                                value={(el as SvgElement).viewBox ?? ''}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  const viewBox = raw.trim().length > 0 ? raw : undefined;
                                  updateElement(el.id, { viewBox } as any);
                                  if (htmlLayout && onHtmlLayoutChange) {
                                    const nextHtml = updateHtmlSvgContent(htmlLayout, el.id, {
                                      viewBox: viewBox ?? null,
                                    });
                                    onHtmlLayoutChange(nextHtml);
                                  }
                                }}
                                placeholder="e.g. 0 0 24 24"
                                className="w-full bg-[#3e3e42] rounded px-2 py-1 text-xs font-mono"
                              />
                            </div>
                          </div>
                        )}
                        
                        {(el.type === 'text' || el.type === 'shape') && (
                          <div className="mt-2 pt-2 border-t border-[#3e3e42]">
                            <Collapsible
                              open={openCollapsible === `gradient-${el.id}`}
                              onOpenChange={(isOpen) => setOpenCollapsible(isOpen ? `gradient-${el.id}` : null)}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <label className="flex items-center gap-2 text-xs text-gray-400 select-none">
                                  <input
                                    type="checkbox"
                                    checked={!!(el as any).gradient?.enabled}
                                    onChange={(e) => {
                                      const enabled = e.target.checked;
                                      if (!enabled) {
                                        updateElement(el.id, { gradient: undefined });
                                        return;
                                      }

                                      const current = (el as any).gradient;
                                      const next = current ?? {
                                        enabled: true,
                                        type: 'linear',
                                        stops: [
                                          { offset: 0, color: '#000000' },
                                          { offset: 1, color: '#ffffff' },
                                        ],
                                        start: { x: 0, y: 0 },
                                        end: { x: Math.max(1, el.width), y: 0 },
                                        rotation: 0,
                                      };
                                      updateElement(el.id, { gradient: { ...next, enabled: true } });
                                    }}
                                  />
                                  Gradient
                                </label>

                                <CollapsibleTrigger asChild>
                                  <button
                                    type="button"
                                    className="p-1 rounded hover:bg-[#3e3e42] text-gray-400"
                                    title="Toggle gradient options"
                                  >
                                    <ChevronDown size={14} />
                                  </button>
                                </CollapsibleTrigger>
                              </div>

                              <CollapsibleContent className="mt-2 space-y-2">
                                {(() => {
                                  const grad = (el as any).gradient;
                                  if (!grad?.enabled) return null;

                                  const stops = Array.isArray(grad.stops) ? grad.stops : [];
                                  const stop0 = stops[0] ?? { offset: 0, color: '#000000' };
                                  const stop1 = stops[1] ?? { offset: 1, color: '#ffffff' };
                                  const rotation = typeof grad.rotation === 'number' ? grad.rotation : 0;

                                  const setGrad = (nextGrad: any) => updateElement(el.id, { gradient: nextGrad });
                                  const setRotation = (deg: number) => {
                                    const width = Math.max(1, el.width);
                                    const height = Math.max(1, el.height);
                                    const len = Math.max(width, height);
                                    const cx = width / 2;
                                    const cy = height / 2;
                                    const rad = (deg * Math.PI) / 180;
                                    const dx = Math.cos(rad);
                                    const dy = Math.sin(rad);
                                    const start = { x: cx - (dx * len) / 2, y: cy - (dy * len) / 2 };
                                    const end = { x: cx + (dx * len) / 2, y: cy + (dy * len) / 2 };
                                    setGrad({ ...grad, rotation: deg, start, end });
                                  };

                                  const radius = Math.round(
                                    Math.sqrt(
                                      Math.pow((grad.end?.x ?? 0) - (grad.start?.x ?? 0), 2) +
                                      Math.pow((grad.end?.y ?? 0) - (grad.start?.y ?? 0), 2),
                                    ),
                                  );

                                  return (
                                    <>
                                      <div className="grid grid-cols-2 gap-2">
                                        <div>
                                          <span className="text-xs text-gray-500 block mb-1">Type</span>
                                          <select
                                            value={grad.type || 'linear'}
                                            onChange={(e) => setGrad({ ...grad, type: e.target.value })}
                                            className="w-full bg-[#3e3e42] rounded px-2 py-1 text-sm"
                                          >
                                            <option value="linear">Linear</option>
                                            <option value="radial">Radial</option>
                                          </select>
                                        </div>
                                        <div>
                                          <span className="text-xs text-gray-500 block mb-1">
                                            {grad.type === 'radial' ? `Radius: ${radius}px` : `Angle: ${Math.round(rotation)}°`}
                                          </span>
                                          <input
                                            type="range"
                                            min={0}
                                            max={grad.type === 'radial' ? 400 : 360}
                                            value={grad.type === 'radial' ? radius : rotation}
                                            onChange={(e) => {
                                              const val = Number(e.target.value);
                                              if (grad.type === 'radial') {
                                                // keep start as center; store radius by pushing end point along +X
                                                const start = grad.start ?? { x: el.width / 2, y: el.height / 2 };
                                                const end = { x: start.x + val, y: start.y };
                                                setGrad({ ...grad, start, end });
                                              } else {
                                                setRotation(val);
                                              }
                                            }}
                                            className="w-full template-range"
                                          />
                                        </div>
                                      </div>

                                      <div className="grid grid-cols-2 gap-2">
                                        <div>
                                          <span className="text-xs text-gray-500 block mb-1">Stop 1</span>
                                          <div className="flex items-center gap-2">
                                            <input
                                              type="color"
                                              value={stop0.color}
                                              onChange={(e) => {
                                                const nextStops = [
                                                  { ...stop0, color: e.target.value },
                                                  stop1,
                                                  ...stops.slice(2),
                                                ];
                                                setGrad({ ...grad, stops: nextStops });
                                              }}
                                              className="h-6 w-8 bg-transparent rounded cursor-pointer"
                                            />
                                            <input
                                              type="number"
                                              min={0}
                                              max={1}
                                              step={0.01}
                                              value={stop0.offset}
                                              onChange={(e) => {
                                                const nextStops = [
                                                  { ...stop0, offset: Number(e.target.value) },
                                                  stop1,
                                                  ...stops.slice(2),
                                                ];
                                                setGrad({ ...grad, stops: nextStops });
                                              }}
                                              className="w-full bg-[#3e3e42] rounded px-2 py-1 text-sm"
                                            />
                                          </div>
                                        </div>
                                        <div>
                                          <span className="text-xs text-gray-500 block mb-1">Stop 2</span>
                                          <div className="flex items-center gap-2">
                                            <input
                                              type="color"
                                              value={stop1.color}
                                              onChange={(e) => {
                                                const nextStops = [
                                                  stop0,
                                                  { ...stop1, color: e.target.value },
                                                  ...stops.slice(2),
                                                ];
                                                setGrad({ ...grad, stops: nextStops });
                                              }}
                                              className="h-6 w-8 bg-transparent rounded cursor-pointer"
                                            />
                                            <input
                                              type="number"
                                              min={0}
                                              max={1}
                                              step={0.01}
                                              value={stop1.offset}
                                              onChange={(e) => {
                                                const nextStops = [
                                                  stop0,
                                                  { ...stop1, offset: Number(e.target.value) },
                                                  ...stops.slice(2),
                                                ];
                                                setGrad({ ...grad, stops: nextStops });
                                              }}
                                              className="w-full bg-[#3e3e42] rounded px-2 py-1 text-sm"
                                            />
                                          </div>
                                        </div>
                                      </div>
                                    </>
                                  );
                                })()}
                              </CollapsibleContent>
                            </Collapsible>
                          </div>
                        )}
                      </div>

        {/* Effects */}
                      <div>
                        <h4 className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-2">Effects</h4>
                         <div className="mt-2 pt-2 border-t border-[#3e3e42]">
                           <Collapsible
                             open={openCollapsible === `shadow-${el.id}`}
                             onOpenChange={(isOpen) => setOpenCollapsible(isOpen ? `shadow-${el.id}` : null)}
                           >
                             <div className="flex items-center justify-between gap-2">
                               <label className="flex items-center gap-2 text-xs text-gray-400 select-none">
                                 <input
                                   type="checkbox"
                                   checked={!!el.shadow?.enabled}
                                   onChange={(e) => {
                                     const enabled = e.target.checked;
                                     if (!enabled) {
                                       updateElement(el.id, { shadow: undefined });
                                       return;
                                     }

                                     const current = el.shadow;
                                     const next = current ?? {
                                       enabled: true,
                                       color: '#000000',
                                       blur: 10,
                                       opacity: 0.5,
                                       offsetX: 5,
                                       offsetY: 5,
                                     };
                                     updateElement(el.id, { shadow: { ...next, enabled: true } });
                                   }}
                                 />
                                 Shadow
                               </label>

                               <CollapsibleTrigger asChild>
                                 <button
                                   type="button"
                                   className="p-1 rounded hover:bg-[#3e3e42] text-gray-400"
                                   title="Toggle shadow options"
                                 >
                                   <ChevronDown size={14} />
                                 </button>
                               </CollapsibleTrigger>
                             </div>

                             <CollapsibleContent className="mt-2 space-y-2">
                               {el.shadow?.enabled && (
                                 <>
                                   <div className="flex items-center gap-2">
                                     <input
                                       type="color"
                                       value={el.shadow.color}
                                       onChange={(e) => updateElement(el.id, { shadow: { ...el.shadow!, color: e.target.value } })}
                                       className="h-6 w-8 bg-transparent rounded cursor-pointer"
                                     />
                                     <span className="text-xs text-gray-400">Color</span>
                                   </div>

                                   {/* Blur slider removed per request; keep blur value as-is or editable via JSON if needed. */}

                                   <div>
                                     <div className="flex justify-between">
                                       <span className="text-xs text-gray-400">Opacity</span>
                                       <span className="text-xs text-gray-500">{Math.round(el.shadow.opacity * 100)}%</span>
                                     </div>
                                     <input
                                       type="range"
                                       min={0}
                                       max={1}
                                       step={0.05}
                                       value={el.shadow.opacity}
                                       onChange={(e) => updateElement(el.id, { shadow: { ...el.shadow!, opacity: Number(e.target.value) } })}
                                       className="w-full template-range"
                                     />
                                   </div>

                                   <div className="grid grid-cols-2 gap-2">
                                     <div>
                                       <span className="text-xs text-gray-500 block mb-1">Offset X</span>
                                       <input
                                         type="number"
                                         value={Math.round(el.shadow.offsetX)}
                                         onChange={(e) => updateElement(el.id, { shadow: { ...el.shadow!, offsetX: Number(e.target.value) } })}
                                         className="w-full bg-[#3e3e42] rounded px-2 py-1 text-sm"
                                       />
                                     </div>
                                     <div>
                                       <span className="text-xs text-gray-500 block mb-1">Offset Y</span>
                                       <input
                                         type="number"
                                         value={Math.round(el.shadow.offsetY)}
                                         onChange={(e) => updateElement(el.id, { shadow: { ...el.shadow!, offsetY: Number(e.target.value) } })}
                                         className="w-full bg-[#3e3e42] rounded px-2 py-1 text-sm"
                                       />
                                     </div>
                                   </div>
                                 </>
                               )}
                             </CollapsibleContent>
                           </Collapsible>
                         </div>
                      </div>

                      <div className="mt-4 pt-4 border-t border-[#3e3e42]">
                        <button onClick={deleteElement} className="w-full py-1.5 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded text-xs flex items-center justify-center gap-2">
                          <Trash2 size={12}/> Delete
                        </button>
                      </div>

                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </Reorder.Item>
            );
          })}
          </Reorder.Group>
        </div>

        {/* Global Output View (for AI / JSON requirement) */}
      
        {/* Footer Actions (currently empty placeholder; grouping handled via toolbar/state) */}
        <div className="p-4 border-t border-[#3e3e42] bg-[#2d2d30]"></div>
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
