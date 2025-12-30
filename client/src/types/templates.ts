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
  name?: string; // User friendly name
  type: 'text' | 'logo' | 'shape' | 'svg' | 'image' | 'group' | 'icon';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  zIndex: number;
  /**
   * Raw inline CSS string from the element's style attribute.
   * This allows arbitrary CSS to round-trip from HTML without being normalized.
   */
  style?: string;
  filters?: FilterProps;
  shadow?: ShadowProps;
  opacity?: number;
  locked?: boolean;
  visible?: boolean;
}

export interface GroupElement extends TemplateElement {
  type: 'group';
  children: string[]; // IDs of children elements
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
  shape: 'rectangle' | 'circle' | 'line' | 'star' | 'triangle' | 'diamond' | 'pentagon' | 'hexagon' | 'octagon' | 'rounded-rectangle';
  color: string;
  opacity?: number;
  borderRadius?: number;
  borderWidth?: number;
  borderColor?: string;
  gradient?: GradientProps;
}

export interface SvgElement extends TemplateElement {
  type: 'svg';
  /**
   * Raw path data (d attribute) for the primary SVG path.
   * We intentionally keep this as a simple string so icons from tools
   * like Figma or Lucide can be round-tripped without extra parsing.
   */
  content: string;
  /**
   * Optional viewBox for the SVG. When present we preserve this instead of
   * forcing a generic 0 0 100 100 box so scaling stays faithful to the
   * original icon or illustration.
   */
  viewBox?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
}

export interface IconElement extends TemplateElement {
  type: 'icon';
  iconName: string; // Name of the Lucide icon (e.g., "Heart", "Plus", "Star")
  color?: string;
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
  elements: (TextElement | LogoElement | ShapeElement | SvgElement | GroupElement)[];
  thumbnail?: string;
  isPremium?: boolean;
}
