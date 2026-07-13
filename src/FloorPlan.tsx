import { useState } from "react";

const GRID = 20; 
const CLOSE_DIST = 10; 


const snap = (v: number) => Math.round(v / GRID) * GRID;

const resolvePoint = (
  x: number,
  y: number,
  points: [number, number][],
): [number, number] => {
  for (const p of points) {
    if (Math.hypot(p[0] - x, p[1] - y) < CLOSE_DIST) return p;
  }
  return [x, y];
};

function FloorPlan({ points, setPoints }: {
  points: [number, number][];
  setPoints: (p: [number, number][]) => void;
}) {
  const [hover, setHover] = useState<[number, number] | null>(null);

  return (
    <svg
      width="100%"
      height="100%"
      style={{ display: "block", width: "100%", height: "100%" }}
      onClick={(e) => {
        const x = snap(e.nativeEvent.offsetX);
        const y = snap(e.nativeEvent.offsetY);
        setPoints([...points, resolvePoint(x, y, points)]);
      }}
      onMouseMove={(e) => {
        setHover([snap(e.nativeEvent.offsetX), snap(e.nativeEvent.offsetY)]);
      }}
      onMouseLeave={() => setHover(null)}
    >
      <defs>
        <pattern id="grid-small" width={20} height={20} patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e5e7eb" strokeWidth={1} />
        </pattern>
        <pattern id="grid-large" width={100} height={100} patternUnits="userSpaceOnUse">
          <rect width={100} height={100} fill="url(#grid-small)" />
          <path d="M 100 0 L 0 0 0 100" fill="none" stroke="#cbd5e1" strokeWidth={1.5} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid-large)" />

      <polyline
        points={points.map((p) => p.join(",")).join(" ")}
        fill="none"
        stroke="black"
      />
      {points.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r={5} fill="red" />
      ))}
      {hover && (
        <circle cx={hover[0]} cy={hover[1]} r={4} fill="none" stroke="#2b7fff" strokeWidth={2} />
      )}
    </svg>
  );
}

export default FloorPlan;
