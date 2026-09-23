import { useMemo, useRef, useState } from "react";
import { createSegment } from "../lib/api";
import type { HeartRateSample, Segment } from "../types";

interface Props {
  sessionId: string;
  samples: HeartRateSample[];
  thresholdBpm: number;
  segments: Segment[];
  onSegmentCreated: (segment: Segment) => void;
  /** Segment id currently hovered in the segments table below — shown
   * with a stronger wash + outline so it's obvious which band it is. */
  highlightedSegmentId?: string | null;
}

const WIDTH = 800;
const CHART_HEIGHT = 280;
const MARGIN = { top: 16, right: 16, bottom: 28, left: 40 };
const PLOT_WIDTH = WIDTH - MARGIN.left - MARGIN.right;
const PLOT_HEIGHT = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;

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

interface PendingSelection {
  startIndex: number;
  endIndex: number;
}

export default function HeartRateChart({
  sessionId,
  samples,
  thresholdBpm: rawThresholdBpm,
  segments,
  onSegmentCreated,
  highlightedSegmentId
}: Props) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragCurrent, setDragCurrent] = useState<number | null>(null);
  const [pendingSelection, setPendingSelection] = useState<PendingSelection | null>(null);
  const [pendingLabel, setPendingLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
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

  const t0 = points[0].t;
  const totalMs = Math.max(1, points[points.length - 1].t - t0);
  function timeToX(timeMs: number): number {
    const x = MARGIN.left + ((timeMs - t0) / totalMs) * PLOT_WIDTH;
    return Math.min(WIDTH - MARGIN.right, Math.max(MARGIN.left, x));
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

  const segmentSpans = segments.map((seg) => ({
    id: seg.id,
    startMs: new Date(seg.startTime).getTime(),
    endMs: new Date(seg.endTime).getTime()
  }));
  // Draw the highlighted span last so its outline isn't covered by a
  // neighboring/overlapping segment's band.
  const highlightedSpan = highlightedSegmentId ? segmentSpans.find((s) => s.id === highlightedSegmentId) ?? null : null;
  const unhighlightedSpans = highlightedSpan ? segmentSpans.filter((s) => s.id !== highlightedSpan.id) : segmentSpans;

  function nearestIndexForClientX(clientX: number): number {
    const svg = svgRef.current;
    if (!svg) return 0;
    const rect = svg.getBoundingClientRect();
    const scaleX = WIDTH / rect.width;
    const svgX = (clientX - rect.left) * scaleX;

    let nearest = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < points.length; i++) {
      const dist = Math.abs(points[i].x - svgX);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = i;
      }
    }
    return nearest;
  }

  function handlePointerMove(event: React.PointerEvent<SVGRectElement>) {
    const nearest = nearestIndexForClientX(event.clientX);
    setHoverIndex(nearest);
    if (dragStart !== null) {
      setDragCurrent(nearest);
    }
  }

  // Drag-to-select: press and drag across the plot to mark out a range,
  // then label it below the chart. A plain click (no real drag distance)
  // is left alone so it doesn't fight with hover/keyboard crosshair use.
  function handlePointerDown(event: React.PointerEvent<SVGRectElement>) {
    const nearest = nearestIndexForClientX(event.clientX);
    setDragStart(nearest);
    setDragCurrent(nearest);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture isn't available in every environment — the drag
      // still works via ordinary pointermove/up, just without capture.
    }
  }

  function handlePointerUp(event: React.PointerEvent<SVGRectElement>) {
    if (dragStart !== null) {
      const end = dragCurrent ?? dragStart;
      const startIndex = Math.min(dragStart, end);
      const endIndex = Math.max(dragStart, end);
      if (endIndex - startIndex >= 1) {
        setPendingSelection({ startIndex, endIndex });
        setPendingLabel("");
        setSaveError(null);
      }
    }
    setDragStart(null);
    setDragCurrent(null);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // No-op if nothing was captured.
    }
  }

  // Arrow-key navigation for the crosshair: same details on keyboard focus
  // as on hover (see dataviz interaction guidance) — Right/Left step the
  // cursor one sample at a time (Shift+Right/Left steps by 10), clamped to
  // the sample range.
  function handleKeyDown(event: React.KeyboardEvent<SVGRectElement>) {
    const step = event.shiftKey ? 10 : 1;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      setHoverIndex((current) => (current === null ? 0 : Math.min(points.length - 1, current + step)));
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      setHoverIndex((current) => (current === null ? points.length - 1 : Math.max(0, current - step)));
    }
  }

  async function handleSaveSegment() {
    if (!pendingSelection) return;
    setSaving(true);
    setSaveError(null);
    try {
      const segment = await createSegment({
        sessionId,
        startTime: points[pendingSelection.startIndex].timestamp,
        endTime: points[pendingSelection.endIndex].timestamp,
        label: pendingLabel
      });
      onSegmentCreated(segment);
      setPendingSelection(null);
      setPendingLabel("");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save segment.");
    } finally {
      setSaving(false);
    }
  }

  const hovered = hoverIndex !== null ? points[hoverIndex] : null;
  // Keep the tooltip box on-screen by flipping it to the left when the
  // hovered point is near the right edge.
  const tooltipWidth = 110;
  const tooltipX = hovered ? Math.min(Math.max(hovered.x - tooltipWidth / 2, MARGIN.left), WIDTH - MARGIN.right - tooltipWidth) : 0;

  const liveSelection =
    dragStart !== null && dragCurrent !== null
      ? { startIndex: Math.min(dragStart, dragCurrent), endIndex: Math.max(dragStart, dragCurrent) }
      : null;
  const activeSelection = pendingSelection ?? liveSelection;

  return (
    <div className="viz-root">
      <svg ref={svgRef} viewBox={`0 0 ${WIDTH} ${CHART_HEIGHT}`} role="img" aria-label="Heart rate over time">
        {/* Above-threshold zone */}
        <rect
          x={MARGIN.left}
          y={bandTop}
          width={PLOT_WIDTH}
          height={Math.max(0, thresholdY - bandTop)}
          fill="var(--viz-critical-band)"
        />

        {/* Labeled segments (auto-detected or drawn by hand) — a subtle
            wash across the plot for each one's time span. Overlapping
            segments layer into a slightly darker wash where they overlap. */}
        {unhighlightedSpans.map((span) => (
          <rect
            key={span.id}
            x={timeToX(span.startMs)}
            y={MARGIN.top}
            width={Math.max(0, timeToX(span.endMs) - timeToX(span.startMs))}
            height={PLOT_HEIGHT}
            fill="var(--viz-segment-band)"
          />
        ))}

        {/* The segment currently hovered in the table below — a stronger
            wash and an outline so the reader sees it respond, same as any
            other hovered mark (see dataviz interaction guidance). */}
        {highlightedSpan && (
          <rect
            x={timeToX(highlightedSpan.startMs)}
            y={MARGIN.top}
            width={Math.max(0, timeToX(highlightedSpan.endMs) - timeToX(highlightedSpan.startMs))}
            height={PLOT_HEIGHT}
            fill="var(--viz-segment-band-active)"
            stroke="var(--viz-segment)"
            strokeWidth={1.5}
          />
        )}

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
            y={CHART_HEIGHT - 8}
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

        {/* Drag-to-select overlay, live while dragging or held while the
            label form below is open */}
        {activeSelection && (
          <g>
            <rect
              x={points[activeSelection.startIndex].x}
              y={MARGIN.top}
              width={Math.max(0, points[activeSelection.endIndex].x - points[activeSelection.startIndex].x)}
              height={PLOT_HEIGHT}
              fill="var(--viz-segment-band)"
            />
            <line
              x1={points[activeSelection.startIndex].x}
              x2={points[activeSelection.startIndex].x}
              y1={MARGIN.top}
              y2={CHART_HEIGHT - MARGIN.bottom}
              stroke="var(--viz-segment)"
              strokeWidth={1.5}
              strokeDasharray="3 3"
            />
            <line
              x1={points[activeSelection.endIndex].x}
              x2={points[activeSelection.endIndex].x}
              y1={MARGIN.top}
              y2={CHART_HEIGHT - MARGIN.bottom}
              stroke="var(--viz-segment)"
              strokeWidth={1.5}
              strokeDasharray="3 3"
            />
          </g>
        )}

        {/* Hover crosshair + tooltip */}
        {hovered && (
          <g>
            <line x1={hovered.x} x2={hovered.x} y1={MARGIN.top} y2={CHART_HEIGHT - MARGIN.bottom} stroke="var(--viz-baseline)" strokeWidth={1} />
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

        {/* Hover hit target — covers the whole plot area. Also keyboard-focusable
            so Left/Right arrow keys can drive the same crosshair, and handles
            press-and-drag to select a range for a new labeled segment. */}
        <rect
          x={MARGIN.left}
          y={MARGIN.top}
          width={PLOT_WIDTH}
          height={PLOT_HEIGHT}
          fill="transparent"
          tabIndex={0}
          role="slider"
          aria-label="Heart rate at time"
          aria-valuemin={0}
          aria-valuemax={points.length - 1}
          aria-valuenow={hoverIndex ?? undefined}
          aria-valuetext={hovered ? `${Math.round(hovered.bpm)} bpm at ${timeFormatter.format(new Date(hovered.timestamp))}` : undefined}
          className="viz-hit-target"
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setHoverIndex(null)}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onKeyDown={handleKeyDown}
          onFocus={() => setHoverIndex((current) => (current === null ? 0 : current))}
          onBlur={() => setHoverIndex(null)}
        />
      </svg>

      {pendingSelection && (
        <div className="viz-segment-form">
          <div className="viz-segment-form-range">
            {timeFormatter.format(new Date(points[pendingSelection.startIndex].timestamp))} –{" "}
            {timeFormatter.format(new Date(points[pendingSelection.endIndex].timestamp))}
          </div>
          <input
            type="text"
            autoFocus
            placeholder="Label this segment…"
            value={pendingLabel}
            onChange={(e) => setPendingLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleSaveSegment();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setPendingSelection(null);
              }
            }}
          />
          <div className="viz-segment-form-actions">
            <button type="button" onClick={() => void handleSaveSegment()} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => {
                setPendingSelection(null);
                setSaveError(null);
              }}
            >
              Cancel
            </button>
          </div>
          {saveError && <p className="viz-segment-form-error">{saveError}</p>}
        </div>
      )}
    </div>
  );
}
