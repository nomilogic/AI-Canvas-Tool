export interface FilterProps {
  blur?: number;
  brightness?: number;
  contrast?: number;
  grayscale?: number;
  hue?: number;
  invert?: number;
  opacity?: number;
  saturate?: number;
  sepia?: number;
}

export interface ShadowProps {
  enabled: boolean;
  color: string;
  blur: number;
  opacity: number;
  offsetX: number;
  offsetY: number;
}

export interface GradientProps {
  enabled: boolean;
  type: 'linear' | 'radial';
  stops: { offset: number; color: string }[];
  start: { x: number; y: number };
  end: { x: number; y: number };
  rotation?: number;
}

export interface TemplateElement {
  id: string;
  type: 'text' | 'logo' | 'shape' | 'svg' | 'image';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  zIndex: number;
  filters?: FilterProps;
  shadow?: ShadowProps;
}

export interface TextElement extends TemplateElement {
  type: 'text';
  content: string;
  fontSize: number;
  fontFamily: string;
  color: string;
  fontWeight: 'normal' | 'bold' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900';
  textAlign: 'left' | 'center' | 'right';
  backgroundColor?: string;
  textOpacity?: number;
  backgroundOpacity?: number;
  padding?: number;
  borderRadius?: number;
  maxWidth?: number;
  gradient?: GradientProps;
}

export interface LogoElement extends TemplateElement {
  type: 'logo' | 'image';
  src: string;
  opacity?: number;
  borderRadius?: number;
  borderColor?: string;
  borderWidth?: number;
}

export interface ShapeElement extends TemplateElement {
  type: 'shape';
  shape: 'rectangle' | 'circle' | 'line' | 'star';
  color: string;
  opacity?: number;
  borderRadius?: number;
  borderWidth?: number;
  borderColor?: string;
  gradient?: GradientProps;
}

export interface SvgElement extends TemplateElement {
  type: 'svg';
  content: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  category: 'social' | 'youtube' | 'business' | 'custom' | 'blank';
  platforms: string[];
  dimensions: {
    width: number;
    height: number;
  };
  elements: (TextElement | LogoElement | ShapeElement | SvgElement)[];
  thumbnail?: string;
  isPremium?: boolean;
}
