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
          "transition-all duration-200 cursor-pointer select-none",
          isSelected ? "selected-tooth" : ""
        )}
        style={{
          transform: isHovered && !isSelected ? "translateY(-2px)" : "none",
          transformOrigin: `${TOOTH_X_POSITIONS[fdi] ?? 400}px 36px`,
          transition: "transform 0.15s ease-out, filter 0.15s ease-out",
        }}
        onClick={() => handleToggle(fdi)}
        onMouseEnter={() => setHoveredTooth(fdi)}
        onMouseLeave={() => setHoveredTooth(null)}
      >
        <title>{`Tooth ${fdi} • ${shape.type}`}</title>

        {/* 1. Outer Luminous Halo / Glow for Selected Teeth (as in reference 23/24-26) */}
        {isSelected && (
          <path
            d={shape.outlinePath}
            fill="none"
            stroke="rgb(45, 212, 191)"
            strokeWidth={3.5}
            strokeOpacity={0.6}
            filter="url(#tooth-selected-halo)"
            className="pointer-events-none"
          />
        )}

        {/* 2. Base Tooth Volume (Full Root & Crown Anatomy) */}
        <path
          d={shape.outlinePath}
          fill={
            isSelected
              ? "url(#tooth-selected-body)"
              : isHovered
              ? "url(#tooth-hover-body)"
              : "url(#tooth-unselected-body)"
          }
          stroke={
            isSelected
              ? "rgb(45, 212, 191)" // teal-400
              : isHovered
              ? "rgba(100, 116, 139, 0.95)" // slate-500
              : "rgba(100, 116, 139, 0.8)" // slate-500
          }
          strokeWidth={isSelected ? 1.8 : isHovered ? 1.5 : 1.25}
          strokeLinecap="round"
          strokeLinejoin="round"
          filter={
            isSelected
              ? undefined
              : isHovered
              ? "url(#tooth-hover-shadow)"
              : "url(#tooth-depth-shadow)"
          }
          className="transition-all duration-150"
        />

        {/* 3. Anatomical Root & Cervical Margin Shading */}
        <path
          d={shape.shadowPath}
          fill={
            isSelected
              ? "url(#tooth-selected-root)"
              : isHovered
              ? "url(#tooth-hover-root)"
              : "url(#tooth-unselected-root)"
          }
          className="transition-all duration-150 pointer-events-none"
        />

        {/* 4. Anatomical Fissures, Grooves & Marginal Ridges */}
        {Array.isArray(shape.lineHighlightPath) ? (
          shape.lineHighlightPath.map((dStr, idx) => (
            <path
              key={idx}
              d={dStr}
              fill="none"
              stroke={
                isSelected
                  ? "rgba(94, 234, 212, 0.9)" // bright teal-300
                  : isHovered
                  ? "rgba(71, 85, 105, 0.8)"
                  : "rgba(100, 116, 139, 0.6)"
              }
              strokeWidth={isSelected ? 1.3 : 1.05}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="transition-colors duration-150 pointer-events-none"
            />
          ))
        ) : (
          <path
            d={shape.lineHighlightPath}
            fill="none"
            stroke={
              isSelected
                ? "rgba(94, 234, 212, 0.9)"
                : isHovered
                ? "rgba(71, 85, 105, 0.8)"
                : "rgba(100, 116, 139, 0.6)"
            }
            strokeWidth={isSelected ? 1.3 : 1.05}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="transition-colors duration-150 pointer-events-none"
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
          viewBox="0 -48 895 270"
          preserveAspectRatio="xMidYMid meet"
          className="w-full h-auto max-h-[270px] select-none block"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* 3D Depth Shadow for unselected teeth */}
            <filter id="tooth-depth-shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="1.5" stdDeviation="1.2" floodColor="#0f172a" floodOpacity="0.25" />
            </filter>

            {/* Hover Lift Shadow */}
            <filter id="tooth-hover-shadow" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="3" stdDeviation="2.5" floodColor="#0f172a" floodOpacity="0.35" />
            </filter>

            {/* Soft Teal Halo / Glow for Selected Teeth (matching reference) */}
            <filter id="tooth-selected-halo" x="-60%" y="-60%" width="220%" height="220%">
              <feDropShadow dx="0" dy="0" stdDeviation="5.5" floodColor="#14b8a6" floodOpacity="0.65" />
              <feDropShadow dx="0" dy="0" stdDeviation="2.5" floodColor="#2dd4bf" floodOpacity="0.85" />
              <feDropShadow dx="0" dy="0" stdDeviation="1" floodColor="#5eead4" floodOpacity="1" />
            </filter>

            {/* Unselected Solid Light Grey / Off-White Tooth Body Gradient */}
            <linearGradient id="tooth-unselected-body" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#cbd5e1" stopOpacity="1" />
              <stop offset="35%" stopColor="#e2e8f0" stopOpacity="1" />
              <stop offset="70%" stopColor="#f1f5f9" stopOpacity="1" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="1" />
            </linearGradient>

            {/* Unselected Root/Cervical Shadow Gradient */}
            <linearGradient id="tooth-unselected-root" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#94a3b8" stopOpacity="0.6" />
              <stop offset="50%" stopColor="#cbd5e1" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#f1f5f9" stopOpacity="0" />
            </linearGradient>

            {/* Hover State Body Gradient */}
            <linearGradient id="tooth-hover-body" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#e2e8f0" stopOpacity="1" />
              <stop offset="40%" stopColor="#f8fafc" stopOpacity="1" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="1" />
            </linearGradient>

            {/* Hover Root Shadow Gradient */}
            <linearGradient id="tooth-hover-root" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#cbd5e1" stopOpacity="0.5" />
              <stop offset="60%" stopColor="#e2e8f0" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </linearGradient>

            {/* Selected Dark Translucent Teal Body Gradient */}
            <linearGradient id="tooth-selected-body" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#042f2e" stopOpacity="0.95" />
              <stop offset="35%" stopColor="#0d5a55" stopOpacity="0.9" />
              <stop offset="75%" stopColor="#115e59" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#134e4a" stopOpacity="0.9" />
            </linearGradient>

            {/* Selected Root Shading Gradient */}
            <linearGradient id="tooth-selected-root" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#021c1b" stopOpacity="0.85" />
              <stop offset="55%" stopColor="#0f766e" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0.1" />
            </linearGradient>
          </defs>

          {/* Corner Quadrant Labels (Teal Pill/Badge Style matching Reference) */}
          {/* Q1 Upper Right (Top-Left) */}
          <g className="select-none pointer-events-none">
            <rect
              x="14"
              y="-42"
              width="108"
              height="22"
              rx="11"
              fill="rgba(20, 184, 166, 0.2)"
              stroke="rgba(45, 212, 191, 0.6)"
              strokeWidth="1.2"
            />
            <text
              x="68"
              y="-27"
              textAnchor="middle"
              fontSize="11"
              fontFamily="sans-serif"
              fontWeight="700"
              fill="rgb(45, 212, 191)"
              className="tracking-wide"
            >
              Q1 Upper Right
            </text>
          </g>

          {/* Q2 Upper Left (Top-Right) */}
          <g className="select-none pointer-events-none">
            <rect
              x="773"
              y="-42"
              width="108"
              height="22"
              rx="11"
              fill="rgba(20, 184, 166, 0.2)"
              stroke="rgba(45, 212, 191, 0.6)"
              strokeWidth="1.2"
            />
            <text
              x="827"
              y="-27"
              textAnchor="middle"
              fontSize="11"
              fontFamily="sans-serif"
              fontWeight="700"
              fill="rgb(45, 212, 191)"
              className="tracking-wide"
            >
              Q2 Upper Left
            </text>
          </g>

          {/* Q4 Lower Right (Bottom-Left) */}
          <g className="select-none pointer-events-none">
            <rect
              x="14"
              y="196"
              width="108"
              height="22"
              rx="11"
              fill="rgba(20, 184, 166, 0.2)"
              stroke="rgba(45, 212, 191, 0.6)"
              strokeWidth="1.2"
            />
            <text
              x="68"
              y="211"
              textAnchor="middle"
              fontSize="11"
              fontFamily="sans-serif"
              fontWeight="700"
              fill="rgb(45, 212, 191)"
              className="tracking-wide"
            >
              Q4 Lower Right
            </text>
          </g>

          {/* Q3 Lower Left (Bottom-Right) */}
          <g className="select-none pointer-events-none">
            <rect
              x="773"
              y="196"
              width="108"
              height="22"
              rx="11"
              fill="rgba(20, 184, 166, 0.2)"
              stroke="rgba(45, 212, 191, 0.6)"
              strokeWidth="1.2"
            />
            <text
              x="827"
              y="211"
              textAnchor="middle"
              fontSize="11"
              fontFamily="sans-serif"
              fontWeight="700"
              fill="rgb(45, 212, 191)"
              className="tracking-wide"
            >
              Q3 Lower Left
            </text>
          </g>

          {/* Subtle Dividers */}
          {/* Horizontal Jaw Divider */}
          <line
            x1="12"
            y1="75"
            x2="883"
            y2="75"
            stroke="currentColor"
            strokeDasharray="3 3"
            className="stroke-border/60"
            strokeWidth="1"
          />

          {/* Vertical Midline Divider */}
          <line
            x1="447.5"
            y1="-38"
            x2="447.5"
            y2="202"
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
                  y="-32"
                  width="44"
                  height="104"
                  fill="transparent"
                  className="cursor-pointer"
                />

                {/* Tooth number text */}
                <text
                  x={x}
                  y="-12"
                  textAnchor="middle"
                  fontSize="15"
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
                  y="76"
                  width="44"
                  height="110"
                  fill="transparent"
                  className="cursor-pointer"
                />

                {/* Tooth number text */}
                <text
                  x={x}
                  y="178"
                  textAnchor="middle"
                  fontSize="15"
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
