import { useMemo, useState } from "react";
import { TOOTH_SHAPES, QUADRANT_TEETH, TOOTH_X_POSITIONS } from "./tooth-data";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

export interface ToothChartProps {
  value?: number[];
  onChange?: (selectedTeeth: number[]) => void;
  className?: string;
  disabled?: boolean;
}

export function ToothChart({
  value = [],
  onChange,
  className,
  disabled = false,
}: ToothChartProps) {
  const [hoveredTooth, setHoveredTooth] = useState<number | null>(null);

  const selectedSet = useMemo(() => new Set(value), [value]);

  const sortedSelected = useMemo(() => {
    return [...value].sort((a, b) => a - b);
  }, [value]);

  const handleToggle = (fdi: number) => {
    if (disabled) return;
    const nextSet = new Set(selectedSet);
    if (nextSet.has(fdi)) {
      nextSet.delete(fdi);
    } else {
      nextSet.add(fdi);
    }
    onChange?.(Array.from(nextSet));
  };

  const handleClear = () => {
    if (disabled) return;
    onChange?.([]);
  };

  const renderToothShape = (fdi: number) => {
    const toothNum = fdi % 10;
    const shape = TOOTH_SHAPES[toothNum] || TOOTH_SHAPES[1];
    const isSelected = selectedSet.has(fdi);
    const isHovered = hoveredTooth === fdi;

    return (
      <g
        key={fdi}
        className={cn(
          "transition-all duration-150 cursor-pointer select-none",
          isSelected ? "selected-tooth" : ""
        )}
        onClick={() => handleToggle(fdi)}
        onMouseEnter={() => setHoveredTooth(fdi)}
        onMouseLeave={() => setHoveredTooth(null)}
      >
        <title>{`Tooth ${fdi} • ${shape.type}`}</title>

        {/* Outline contour */}
        <path
          d={shape.outlinePath}
          fill="none"
          stroke={
            isSelected
              ? "rgb(45, 212, 191)" // teal-400
              : isHovered
              ? "rgba(226, 232, 240, 0.9)" // light slate
              : "rgba(148, 163, 184, 0.65)" // muted slate
          }
          strokeWidth={isSelected ? 2.4 : isHovered ? 2.0 : 1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="transition-colors duration-150"
        />

        {/* Inner surface shadow / fill */}
        <path
          d={shape.shadowPath}
          fill={
            isSelected
              ? "rgba(20, 184, 166, 0.45)" // teal accent fill
              : isHovered
              ? "rgba(148, 163, 184, 0.15)"
              : "transparent"
          }
          className="transition-all duration-150"
        />

        {/* Anatomical Line Highlight / Grooves */}
        {Array.isArray(shape.lineHighlightPath) ? (
          shape.lineHighlightPath.map((dStr, idx) => (
            <path
              key={idx}
              d={dStr}
              fill="none"
              stroke={
                isSelected
                  ? "rgba(94, 234, 212, 0.85)" // teal-300
                  : isHovered
                  ? "rgba(203, 213, 225, 0.6)"
                  : "rgba(148, 163, 184, 0.4)"
              }
              strokeWidth={isSelected ? 1.5 : 1.2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="transition-colors duration-150"
            />
          ))
        ) : (
          <path
            d={shape.lineHighlightPath}
            fill="none"
            stroke={
              isSelected
                ? "rgba(94, 234, 212, 0.85)"
                : isHovered
                ? "rgba(203, 213, 225, 0.6)"
                : "rgba(148, 163, 184, 0.4)"
            }
            strokeWidth={isSelected ? 1.5 : 1.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="transition-colors duration-150"
          />
        )}
      </g>
    );
  };

  return (
    <div className={cn("flex flex-col gap-2 rounded-lg border border-border bg-card/40 p-3 sm:p-4", className)}>
      {/* Small muted orientation line */}
      <div className="flex items-center justify-between text-[11px] text-muted-foreground px-0.5">
        <span>Doctor view — facing patient</span>
        <span className="font-mono text-[10px] opacity-75">FDI ISO-3950</span>
      </div>

      {/* Single Unified Odontogram SVG */}
      <div className="w-full rounded-md border border-border/40 bg-muted/10 p-2 sm:p-3 overflow-hidden">
        <svg
          viewBox="0 -36 895 230"
          preserveAspectRatio="xMidYMid meet"
          className="w-full h-auto max-h-[230px] select-none block"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Subtle Dividers */}
          {/* Horizontal Jaw Divider */}
          <line
            x1="5"
            y1="75"
            x2="890"
            y2="75"
            stroke="currentColor"
            strokeDasharray="3 3"
            className="stroke-border/60"
            strokeWidth="1"
          />

          {/* Vertical Midline Divider */}
          <line
            x1="447.5"
            y1="-26"
            x2="447.5"
            y2="185"
            stroke="currentColor"
            strokeDasharray="4 4"
            className="stroke-primary/40"
            strokeWidth="1.2"
          />

          {/* QUADRANT 1: Upper Right (18 -> 11) */}
          <g transform="">
            {QUADRANT_TEETH.Q1.map((fdi) => renderToothShape(fdi))}
          </g>

          {/* QUADRANT 2: Upper Left (21 -> 28) */}
          <g transform="translate(840, 0) scale(-1, 1) translate(-55, 0)">
            {QUADRANT_TEETH.Q2.map((fdi) => renderToothShape(fdi))}
          </g>

          {/* QUADRANT 4: Lower Right (48 -> 41) - Placed on Bottom-Left directly below Q1 */}
          <g transform="scale(1, -1) translate(0, -150)">
            {QUADRANT_TEETH.Q4.map((fdi) => renderToothShape(fdi))}
          </g>

          {/* QUADRANT 3: Lower Left (31 -> 38) - Placed on Bottom-Right directly below Q2 */}
          <g transform="translate(840, 0) scale(-1, -1) translate(-55, -150)">
            {QUADRANT_TEETH.Q3.map((fdi) => renderToothShape(fdi))}
          </g>

          {/* UPPER TOOTH NUMBERS & HIT TARGETS */}
          {[...QUADRANT_TEETH.Q1, ...QUADRANT_TEETH.Q2].map((fdi) => {
            const x = TOOTH_X_POSITIONS[fdi] ?? 0;
            const isSelected = selectedSet.has(fdi);
            const isHovered = hoveredTooth === fdi;

            return (
              <g
                key={`label-${fdi}`}
                className="cursor-pointer"
                onClick={() => handleToggle(fdi)}
                onMouseEnter={() => setHoveredTooth(fdi)}
                onMouseLeave={() => setHoveredTooth(null)}
              >
                {/* Invisible large hit box for effortless clicking/tapping */}
                <rect
                  x={x - 22}
                  y="-34"
                  width="44"
                  height="105"
                  fill="transparent"
                  className="cursor-pointer"
                />

                {/* Tooth number text */}
                <text
                  x={x}
                  y="-12"
                  textAnchor="middle"
                  fontSize="16"
                  fontFamily="monospace"
                  fontWeight={isSelected ? "700" : isHovered ? "600" : "600"}
                  fill={
                    isSelected
                      ? "rgb(45, 212, 191)"
                      : isHovered
                      ? "rgba(241, 245, 249, 0.95)"
                      : "rgba(148, 163, 184, 0.9)"
                  }
                  className="transition-colors duration-150 select-none"
                >
                  {fdi}
                </text>
              </g>
            );
          })}

          {/* LOWER TOOTH NUMBERS & HIT TARGETS */}
          {[...QUADRANT_TEETH.Q4, ...QUADRANT_TEETH.Q3].map((fdi) => {
            const x = TOOTH_X_POSITIONS[fdi] ?? 0;
            const isSelected = selectedSet.has(fdi);
            const isHovered = hoveredTooth === fdi;

            return (
              <g
                key={`label-${fdi}`}
                className="cursor-pointer"
                onClick={() => handleToggle(fdi)}
                onMouseEnter={() => setHoveredTooth(fdi)}
                onMouseLeave={() => setHoveredTooth(null)}
              >
                {/* Invisible large hit box for effortless clicking/tapping */}
                <rect
                  x={x - 22}
                  y="78"
                  width="44"
                  height="112"
                  fill="transparent"
                  className="cursor-pointer"
                />

                {/* Tooth number text */}
                <text
                  x={x}
                  y="180"
                  textAnchor="middle"
                  fontSize="16"
                  fontFamily="monospace"
                  fontWeight={isSelected ? "700" : isHovered ? "600" : "600"}
                  fill={
                    isSelected
                      ? "rgb(45, 212, 191)"
                      : isHovered
                      ? "rgba(241, 245, 249, 0.95)"
                      : "rgba(148, 163, 184, 0.9)"
                  }
                  className="transition-colors duration-150 select-none"
                >
                  {fdi}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Selected Teeth Summary Footer */}
      <div className="flex items-center justify-between border-t border-border/60 pt-2 text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-muted-foreground">Selected:</span>
          {sortedSelected.length === 0 ? (
            <span className="text-muted-foreground/70 italic text-[11px]">None</span>
          ) : (
            <div className="flex items-center gap-1.5 flex-wrap">
              {sortedSelected.map((fdi) => (
                <Badge
                  key={fdi}
                  variant="outline"
                  className="h-5 px-1.5 py-0 border-teal-500/40 text-teal-300 bg-teal-500/10 font-mono text-[11px] font-medium"
                >
                  {fdi}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {sortedSelected.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClear}
            className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3 mr-1" />
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}
