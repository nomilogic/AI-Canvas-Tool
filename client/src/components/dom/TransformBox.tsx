import React, { useState, useRef, useEffect } from "react";
import { RotateCw } from "lucide-react";
import { calculateResize, calculateRotation, ResizeHandle } from "../../lib/domTransformUtils";

export interface DomTransform {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

interface TransformBoxProps {
  transform: DomTransform;
  isSelected: boolean;
  /** Called with updates in canvas coordinate space (unscaled). */
  onUpdate: (updates: Partial<DomTransform>) => void;
  onSelect: (multi?: boolean) => void;
  /** Current zoom/scale applied to the canvas container. */
  scale: number;
  snapToGrid?: boolean;
  gridSize?: number;
  /** Disable rotate handle when false (useful for group transforms). */
  enableRotate?: boolean;
  children: React.ReactNode;
}

export const TransformBox: React.FC<TransformBoxProps> = ({
  transform,
  isSelected,
  onUpdate,
  onSelect,
  scale,
  snapToGrid = false,
  gridSize = 10,
  enableRotate = true,
  children,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState<ResizeHandle | null>(null);
  const [isRotating, setIsRotating] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const transformStartRef = useRef<DomTransform>(transform);
  // DOM ref for computing accurate screen-space center during rotation
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const rotateCenterRef = useRef<{ x: number; y: number } | null>(null);

  const snap = (value: number) =>
    snapToGrid ? Math.round(value / gridSize) * gridSize : value;

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    // Prevent native drag/select behavior (important for images).
    e.preventDefault();
    // Allow meta/ctrl-click for multi-select in the future if needed.
    e.stopPropagation();
    onSelect(e.metaKey || e.ctrlKey);
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    transformStartRef.current = transform;
  };

  const handleResizeStart = (e: React.MouseEvent, handle: ResizeHandle) => {
    e.preventDefault();
    e.stopPropagation();
    onSelect(e.metaKey || e.ctrlKey);
    setIsResizing(handle);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    transformStartRef.current = transform;
  };

  const handleRotateStart = (e: React.MouseEvent) => {
    if (!enableRotate) return;
    e.preventDefault();
    e.stopPropagation();
    onSelect(e.metaKey || e.ctrlKey);
    // Compute rotation center in screen coordinates from the DOM rect
    const rect = nodeRef.current?.getBoundingClientRect();
    if (!rect) return;
    rotateCenterRef.current = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
    setIsRotating(true);
    transformStartRef.current = transform;
  };

  useEffect(() => {
    if (!isDragging && !isResizing && !isRotating) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rawDelta = {
        x: e.clientX - dragStartRef.current.x,
        y: e.clientY - dragStartRef.current.y,
      };
      // Convert from screen/viewport pixels to canvas coordinates.
      const delta = {
        x: rawDelta.x / (scale || 1),
        y: rawDelta.y / (scale || 1),
      };

      if (isDragging) {
        onUpdate({
          x: snap(transformStartRef.current.x + delta.x),
          y: snap(transformStartRef.current.y + delta.y),
        });
      } else if (isResizing) {
        // Corner handles scale width & height together (maintain aspect ratio).
        const isCornerHandle =
          isResizing === "top-left" ||
          isResizing === "top-right" ||
          isResizing === "bottom-left" ||
          isResizing === "bottom-right";
        // For DOM-based editor, keep the transform box axis-aligned during resize;
        // ignore element rotation for the resize math, we only rotate inner content.
        const startNoRotation = {
          ...transformStartRef.current,
          rotation: 0,
        };
        const updates = calculateResize(
          startNoRotation,
          isResizing,
          delta,
          isCornerHandle ? true : e.shiftKey,
        );
        onUpdate({
          ...updates,
          x: snap(updates.x ?? transformStartRef.current.x),
          y: snap(updates.y ?? transformStartRef.current.y),
          width: snap(updates.width ?? transformStartRef.current.width),
          height: snap(updates.height ?? transformStartRef.current.height),
        });
      } else if (isRotating) {
        // Rotation is computed entirely in screen space using the cached center.
        const centerScreen = rotateCenterRef.current;
        if (!centerScreen) return;
        const angle = calculateRotation(centerScreen, {
          x: e.clientX,
          y: e.clientY,
        });
        let newRotation = angle - 90;
        if (e.shiftKey) {
          newRotation = Math.round(newRotation / 15) * 15;
        }
        onUpdate({ rotation: newRotation });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(null);
      setIsRotating(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, isResizing, isRotating, onUpdate, scale, snap]);

  const resizeHandles: ResizeHandle[] = [
    "top-left",
    "top-right",
    "bottom-left",
    "bottom-right",
    "top",
    "right",
    "bottom",
    "left",
  ];

  const getHandleStyle = (handle: ResizeHandle): React.CSSProperties => {
    const baseStyle: React.CSSProperties = {
      position: "absolute",
      background: "white",
      border: "2px solid #3b82f6",
      zIndex: 10,
    };

    const cornerSize = 14;
    const edgeSize = 10;

    switch (handle) {
      case "top-left":
        return {
          ...baseStyle,
          width: cornerSize,
          height: cornerSize,
          top: 0,
          left: 0,
          cursor: "nwse-resize",
          borderRadius: "50%",
        };
      case "top-right":
        return {
          ...baseStyle,
          width: cornerSize,
          height: cornerSize,
          top: 0,
          right: 0,
          cursor: "nesw-resize",
          borderRadius: "50%",
        };
      case "bottom-left":
        return {
          ...baseStyle,
          width: cornerSize,
          height: cornerSize,
          bottom: 0,
          left: 0,
          cursor: "nesw-resize",
          borderRadius: "50%",
        };
      case "bottom-right":
        return {
          ...baseStyle,
          width: cornerSize,
          height: cornerSize,
          bottom: 0,
          right: 0,
          cursor: "nwse-resize",
          borderRadius: "50%",
        };
      case "top":
        return {
          ...baseStyle,
          width: edgeSize,
          height: edgeSize,
          top: 0,
          left: "50%",
          transform: "translateX(-50%)",
          cursor: "ns-resize",
          borderRadius: "50%",
        };
      case "bottom":
        return {
          ...baseStyle,
          width: edgeSize,
          height: edgeSize,
          bottom: 0,
          left: "50%",
          transform: "translateX(-50%)",
          cursor: "ns-resize",
          borderRadius: "50%",
        };
      case "left":
        return {
          ...baseStyle,
          width: edgeSize,
          height: edgeSize,
          top: "50%",
          left: 0,
          transform: "translateY(-50%)",
          cursor: "ew-resize",
          borderRadius: "50%",
        };
      case "right":
        return {
          ...baseStyle,
          width: edgeSize,
          height: edgeSize,
          top: "50%",
          right: 0,
          transform: "translateY(-50%)",
          cursor: "ew-resize",
          borderRadius: "50%",
        };
      default:
        return baseStyle;
    }
  };

  return (
    <>
      {/* Content box (axis-aligned transform box; inner content rotates) */}
      <div
        ref={nodeRef}
        className="absolute select-none transition-shadow"
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
        style={{
          left: transform.x,
          top: transform.y,
          width: transform.width,
          height: transform.height,
          cursor: isDragging ? "grabbing" : "grab",
          boxShadow: isSelected
            ? "0 0 0 2px #3b82f6, 0 8px 16px rgba(59, 130, 246, 0.2)"
            : "0 4px 12px rgba(0,0,0,0.1)",
        }}
        onMouseDown={handleMouseDown}
      >
        <div
          className="absolute inset-0"
          style={{
            transform: `rotate(${transform.rotation}deg)`,
            transformOrigin: "center center",
          }}
        >
          {children}
        </div>
      </div>

      {/* Selection frame + handles (stay axis-aligned) */}
      {isSelected && (
        <>
          <div
            className="absolute pointer-events-none"
            style={{
              left: transform.x,
              top: transform.y,
              width: transform.width,
              height: transform.height,
              border: "2px solid #3b82f6",
            }}
          />

          <div
            className="absolute"
            style={{
              left: transform.x,
              top: transform.y,
              width: transform.width,
              height: transform.height,
              pointerEvents: "none",
            }}
          >
            {resizeHandles.map((handle) => (
              <div
                key={handle}
                style={getHandleStyle(handle)}
                onMouseDown={(e) => handleResizeStart(e, handle)}
                className="pointer-events-auto hover:scale-125 transition-transform"
              />
            ))}

            {enableRotate && (
              <div
                className="absolute pointer-events-auto bg-blue-500 hover:bg-blue-600 text-white rounded-full p-2 cursor-pointer transition-all hover:scale-110"
                style={{
                  top: 4,
                  left: "50%",
                  transform: "translateX(-50%)",
                }}
                title="Rotate (hold Shift for 15° snapping)"
                onMouseDown={handleRotateStart}
              >
                <RotateCw size={14} />
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
};
