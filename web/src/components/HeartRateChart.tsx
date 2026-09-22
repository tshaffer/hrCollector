import { useMemo, useRef, useState } from "react";
import type { HeartRateSample } from "../types";

interface Props {
  samples: HeartRateSample[];
  thresholdBpm: number;
}

const WIDTH = 800;
const HEIGHT = 280;
const MARGIN = { top: 16, right: 16, bottom: 28, left: 40 };
const PLOT_WIDTH = WIDTH - MARGIN.left - MARGIN.right;
const PLOT_HEIGHT = HEIGHT - MARGIN.top - MARGIN.bottom;

const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" });
const axisTimeFormatter = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

/** Picks a "nice" gridline step (1/2/5 * 10^n) for a given range and target tick count. */
function niceStep(range: number, targetTicks: number): number {
  const rough = range / targetTicks;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough || 1)));
  const normalized = rough / magnitude;
  const step = normalized >= 5 ? 5 : normalized >= 2 ? 2 : 1;
  return step * magnitude;
}

export default function HeartRateChart({ samples, thresholdBpm: rawThresholdBpm }: Props) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  // Guards against a missing/invalid limit collapsing the whole chart to
  // NaN coordinates (SVG silently falls back to 0 for an invalid numeric
  // attribute, which can look plausible while being completely broken).
  const thresholdBpm = typeof rawThresholdBpm === "number" && Number.isFinite(rawThresholdBpm) ? rawThresholdBpm : 100;

  const points = useMemo(() => {
    if (samples.length === 0) return [];
    const sorted = [...samples].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const t0 = new Date(sorted[0].timestamp).getTime();
    const tEnd = new Date(sorted[sorted.length - 1].timestamp).getTime();
    const totalMs = Math.max(1, tEnd - t0);
    return sorted.map((s) => ({
      t: new Date(s.timestamp).getTime(),
      x: MARGIN.left + ((new Date(s.timestamp).getTime() - t0) / totalMs) * PLOT_WIDTH,
      bpm: s.bpm,
      timestamp: s.timestamp
    }));
  }, [samples]);

  if (points.length === 0) {
    return <p className="empty-state">No heart rate samples recorded for this session.</p>;
  }

  const bpmValues = points.map((p) => p.bpm);
  const rawMin = Math.min(...bpmValues, thresholdBpm);
  const rawMax = Math.max(...bpmValues, thresholdBpm);
  const pad = Math.max(5, (rawMax - rawMin) * 0.12);
  const yMin = Math.max(0, Math.floor(rawMin - pad));
  const yMax = Math.ceil(rawMax + pad);

  function yScale(bpm: number): number {
    return MARGIN.top + (1 - (bpm - yMin) / (yMax - yMin)) * PLOT_HEIGHT;
  }

  const gridStep = niceStep(yMax - yMin, 4);
  const gridTicks: number[] = [];
  for (let v = Math.ceil(yMin / gridStep) * gridStep; v <= yMax; v += gridStep) {
    gridTicks.push(Math.round(v));
  }

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${yScale(p.bpm).toFixed(1)}`).join(" ");

  const maxPoint = points.reduce((best, p) => (p.bpm > best.bpm ? p : best), points[0]);
  const thresholdY = yScale(thresholdBpm);
  const bandTop = yScale(yMax);

  const xTickTimes = [points[0].t, points[Math.floor(points.length / 2)].t, points[points.length - 1].t];

  function handlePointerMove(event: React.PointerEvent<SVGRectElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = WIDTH / rect.width;
    const svgX = (event.clientX - rect.left) * scaleX;

    let nearest = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < points.length; i++) {
      const dist = Math.abs(points[i].x - svgX);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = i;
      }
    }
    setHoverIndex(nearest);
  }

  const hovered = hoverIndex !== null ? points[hoverIndex] : null;
  // Keep the tooltip box on-screen by flipping it to the left when the
  // hovered point is near the right edge.
  const tooltipWidth = 110;
  const tooltipX = hovered ? Math.min(Math.max(hovered.x - tooltipWidth / 2, MARGIN.left), WIDTH - MARGIN.right - tooltipWidth) : 0;

  return (
    <div className="viz-root">
      <svg ref={svgRef} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Heart rate over time">
        {/* Above-threshold zone */}
        <rect
          x={MARGIN.left}
          y={bandTop}
          width={PLOT_WIDTH}
          height={Math.max(0, thresholdY - bandTop)}
          fill="var(--viz-critical-band)"
        />
        {gridTicks.map((tick) => (
          <line
            key={tick}
            x1={MARGIN.left}
            x2={WIDTH - MARGIN.right}
            y1={yScale(tick)}
            y2={yScale(tick)}
            stroke="var(--viz-gridline)"
            strokeWidth={1}
          />
        ))}
        {gridTicks.map((tick) => (
          <text key={`label-${tick}`} x={MARGIN.left - 8} y={yScale(tick) + 3} textAnchor="end" className="viz-axis-text">
            {tick}
          </text>
        ))}
        {xTickTimes.map((t, i) => (
          <text
            key={i}
            x={MARGIN.left + (i === 0 ? 0 : i === 1 ? PLOT_WIDTH / 2 : PLOT_WIDTH)}
            y={HEIGHT - 8}
            textAnchor={i === 0 ? "start" : i === 1 ? "middle" : "end"}
            className="viz-axis-text"
          >
            {axisTimeFormatter.format(new Date(t))}
          </text>
        ))}

        {/* Threshold reference line */}
        <line
          x1={MARGIN.left}
          x2={WIDTH - MARGIN.right}
          y1={thresholdY}
          y2={thresholdY}
          stroke="var(--viz-baseline)"
          strokeWidth={1.5}
          strokeDasharray="5 4"
        />
        <text x={WIDTH - MARGIN.right} y={thresholdY - 6} textAnchor="end" className="viz-threshold-label">
          {thresholdBpm} bpm limit
        </text>
        {thresholdY - bandTop > 16 && (
          <text x={WIDTH - MARGIN.right} y={bandTop + 14} textAnchor="end" className="viz-band-label">
            Over limit
          </text>
        )}

        {/* Heart rate line */}
        <path d={linePath} fill="none" stroke="var(--viz-series)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {/* Max point marker (the extreme — the point of the chart) */}
        <circle cx={maxPoint.x} cy={yScale(maxPoint.bpm)} r={4} fill="var(--viz-series)" stroke="var(--viz-surface)" strokeWidth={2} />
        <text x={maxPoint.x} y={yScale(maxPoint.bpm) - 10} textAnchor="middle" className="viz-max-label">
          {Math.round(maxPoint.bpm)}
        </text>

        {/* Hover crosshair + tooltip */}
        {hovered && (
          <g>
            <line x1={hovered.x} x2={hovered.x} y1={MARGIN.top} y2={HEIGHT - MARGIN.bottom} stroke="var(--viz-baseline)" strokeWidth={1} />
            <circle cx={hovered.x} cy={yScale(hovered.bpm)} r={4} fill="var(--viz-series)" stroke="var(--viz-surface)" strokeWidth={2} />
            <rect x={tooltipX} y={MARGIN.top} width={tooltipWidth} height={36} rx={6} fill="var(--viz-surface)" stroke="var(--color-border)" />
            <text x={tooltipX + 8} y={MARGIN.top + 15} className="viz-tooltip-value">
              {Math.round(hovered.bpm)} bpm
            </text>
            <text x={tooltipX + 8} y={MARGIN.top + 29} className="viz-tooltip-label">
              {timeFormatter.format(new Date(hovered.timestamp))}
            </text>
          </g>
        )}

        {/* Hover hit target — covers the whole plot area */}
        <rect
          x={MARGIN.left}
          y={MARGIN.top}
          width={PLOT_WIDTH}
          height={PLOT_HEIGHT}
          fill="transparent"
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setHoverIndex(null)}
        />
      </svg>
    </div>
  );
}
