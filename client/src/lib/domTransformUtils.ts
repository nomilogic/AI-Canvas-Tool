export type ResizeHandle =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "top"
  | "right"
  | "bottom"
  | "left";

export interface Position {
  x: number;
  y: number;
}

export interface DomTransformGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export const rotatePoint = (
  point: Position,
  center: Position,
  angle: number,
): Position => {
  const radians = (angle * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  const dx = point.x - center.x;
  const dy = point.y - center.y;

  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
};

export const calculateResize = (
  transform: DomTransformGeometry,
  handle: ResizeHandle,
  delta: Position,
  maintainAspectRatio: boolean = false,
): Partial<DomTransformGeometry> => {
  const { x, y, width, height, rotation } = transform;

  const radians = (rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  const rotatedDelta = {
    x: delta.x * cos + delta.y * sin,
    y: -delta.x * sin + delta.y * cos,
  };

  let newX = x;
  let newY = y;
  let newWidth = width;
  let newHeight = height;

  switch (handle) {
    case "top-left":
      newWidth = width - rotatedDelta.x;
      newHeight = height - rotatedDelta.y;
      if (maintainAspectRatio) {
        const avgScale = (newWidth / width + newHeight / height) / 2;
        newWidth = width * avgScale;
        newHeight = height * avgScale;
      }
      newX = x + (width - newWidth) * cos - (height - newHeight) * sin;
      newY = y + (width - newWidth) * sin + (height - newHeight) * cos;
      break;

    case "top-right":
      newWidth = width + rotatedDelta.x;
      newHeight = height - rotatedDelta.y;
      if (maintainAspectRatio) {
        const avgScale = (newWidth / width + newHeight / height) / 2;
        newWidth = width * avgScale;
        newHeight = height * avgScale;
      }
      newX = x - (height - newHeight) * sin;
      newY = y + (height - newHeight) * cos;
      break;

    case "bottom-left":
      newWidth = width - rotatedDelta.x;
      newHeight = height + rotatedDelta.y;
      if (maintainAspectRatio) {
        const avgScale = (newWidth / width + newHeight / height) / 2;
        newWidth = width * avgScale;
        newHeight = height * avgScale;
      }
      newX = x + (width - newWidth) * cos;
      newY = y + (width - newWidth) * sin;
      break;

    case "bottom-right":
      newWidth = width + rotatedDelta.x;
      newHeight = height + rotatedDelta.y;
      if (maintainAspectRatio) {
        const avgScale = (newWidth / width + newHeight / height) / 2;
        newWidth = width * avgScale;
        newHeight = height * avgScale;
      }
      break;

    case "top":
      newHeight = height - rotatedDelta.y;
      newX = x - (height - newHeight) * sin;
      newY = y + (height - newHeight) * cos;
      break;

    case "bottom":
      newHeight = height + rotatedDelta.y;
      break;

    case "left":
      newWidth = width - rotatedDelta.x;
      newX = x + (width - newWidth) * cos;
      newY = y + (width - newWidth) * sin;
      break;

    case "right":
      newWidth = width + rotatedDelta.x;
      break;
  }

  newWidth = Math.max(5, newWidth);
  newHeight = Math.max(5, newHeight);

  return {
    x: newX,
    y: newY,
    width: newWidth,
    height: newHeight,
  };
};

export const calculateRotation = (
  center: Position,
  point: Position,
): number => {
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return (Math.atan2(dy, dx) * 180) / Math.PI;
};

export const snapToGrid = (value: number, gridSize: number): number => {
  return Math.round(value / gridSize) * gridSize;
};
