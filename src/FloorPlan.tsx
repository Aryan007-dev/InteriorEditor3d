function FloorPlan({ points, setPoints }: {
  points: [number, number][];
  setPoints: (p: [number, number][]) => void;
}) {
  return (
    <svg
      width={400}
      height={400}
      style={{ border: "1px solid black" }}
      onClick={(e) => {
        const x = e.nativeEvent.offsetX;
        const y = e.nativeEvent.offsetY;
        setPoints([...points, [x, y]]);
      }}
    >
      {points.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r={5} fill="red" />
      ))}
      <polyline
        points={points.map((p) => p.join(",")).join(" ")}
        fill="none"
        stroke="black"
      />
    </svg>
  );
}

export default FloorPlan;
