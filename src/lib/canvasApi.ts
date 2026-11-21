// Imperative handle the Canvas registers so other modules can drive the viewport.
export const canvasApi: {
  fit: (ids?: string[], inset?: { right?: number }) => void;
  zoomBy: (f: number) => void;
  reset: () => void;
  screenToWorld: (cx: number, cy: number) => { x: number; y: number };
  viewCenter: () => { x: number; y: number };
} = {
  fit: () => {},
  zoomBy: () => {},
  reset: () => {},
  screenToWorld: (x, y) => ({ x, y }),
  viewCenter: () => ({ x: 0, y: 0 }),
};
