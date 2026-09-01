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
          transformOrigin: `${TOOTH_X_POSITIONS[fdi] ?? 400}px 26px`,
          transition: "transform 0.15s ease-out, filter 0.15s ease-out",
        }}
        onClick={() => handleToggle(fdi)}
        onMouseEnter={() => setHoveredTooth(fdi)}
        onMouseLeave={() => setHoveredTooth(null)}
      >
        <title>{`Tooth ${fdi} • ${shape.type}`}</title>

        {/* 1. Base 3D Tooth Volume (Full Anatomy: Root to Crown) */}
        <path
          d={shape.outlinePath}
          fill={
            isSelected
              ? "url(#selected-crown-gradient)"
              : isHovered
              ? "url(#hover-crown-gradient)"
              : "url(#ivory-crown-gradient)"
          }
          stroke={
            isSelected
              ? "rgb(45, 212, 191)" // teal-400
              : isHovered
              ? "rgba(100, 116, 139, 0.85)" // slate-500
              : "rgba(148, 163, 184, 0.75)" // slate-400
          }
          strokeWidth={isSelected ? 2.0 : isHovered ? 1.6 : 1.25}
          strokeLinecap="round"
          strokeLinejoin="round"
          filter={
            isSelected
              ? "url(#tooth-selected-glow)"
              : isHovered
              ? "url(#tooth-hover-shadow)"
              : "url(#tooth-depth-shadow)"
          }
          className="transition-all duration-150"
        />

        {/* 2. Anatomical Root Contour & Cervical Margin Shading */}
        <path
          d={shape.shadowPath}
          fill={
            isSelected
              ? "url(#selected-root-gradient)"
              : isHovered
              ? "url(#hover-root-gradient)"
              : "url(#ivory-root-gradient)"
          }
          className="transition-all duration-150 pointer-events-none"
        />

        {/* 3. Anatomical Fissures, Grooves & Marginal Ridges */}
        {Array.isArray(shape.lineHighlightPath) ? (
          shape.lineHighlightPath.map((dStr, idx) => (
            <path
              key={idx}
              d={dStr}
              fill="none"
              stroke={
                isSelected
                  ? "rgba(240, 253, 250, 0.95)" // crisp luminous teal-50
                  : isHovered
                  ? "rgba(71, 85, 105, 0.75)" // slate-600
                  : "rgba(100, 116, 139, 0.55)" // slate-500
              }
              strokeWidth={isSelected ? 1.5 : 1.1}
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
                ? "rgba(240, 253, 250, 0.95)"
                : isHovered
                ? "rgba(71, 85, 105, 0.75)"
                : "rgba(100, 116, 139, 0.55)"
            }
            strokeWidth={isSelected ? 1.5 : 1.1}
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
            {/* 3D Depth Shadow for teeth */}
            <filter id="tooth-depth-shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="1.5" stdDeviation="1.2" floodColor="#0f172a" floodOpacity="0.15" />
            </filter>

            {/* Hover Lift Shadow */}
            <filter id="tooth-hover-shadow" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="3" stdDeviation="2.5" floodColor="#0f172a" floodOpacity="0.25" />
            </filter>

            {/* Selected Vibrant Teal Glow */}
            <filter id="tooth-selected-glow" x="-40%" y="-40%" width="180%" height="180%">
              <feDropShadow dx="0" dy="0" stdDeviation="3.5" floodColor="#14b8a6" floodOpacity="0.75" />
              <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor="#2dd4bf" floodOpacity="0.9" />
            </filter>

            {/* Normal Ivory / Enamel Gradient (Root to Biting Edge) */}
            <linearGradient id="ivory-crown-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#e5dccf" />
              <stop offset="30%" stopColor="#efe8dc" />
              <stop offset="65%" stopColor="#faf7f1" />
              <stop offset="88%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#f5f0e6" />
            </linearGradient>

            {/* Normal Root & Cervical Shadow Gradient */}
            <linearGradient id="ivory-root-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#cfbeaa" stopOpacity="0.85" />
              <stop offset="50%" stopColor="#decbb7" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#f8f4ec" stopOpacity="0.05" />
            </linearGradient>

            {/* Hover Pearl Gradient (Root to Biting Edge) */}
            <linearGradient id="hover-crown-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#cbd5e1" />
              <stop offset="35%" stopColor="#e2e8f0" />
              <stop offset="75%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#f1f5f9" />
            </linearGradient>

            {/* Hover Root Shadow Gradient */}
            <linearGradient id="hover-root-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#94a3b8" stopOpacity="0.7" />
              <stop offset="60%" stopColor="#cbd5e1" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0.1" />
            </linearGradient>

            {/* Selected 3D Teal Crown Gradient (Root to Biting Edge) */}
            <linearGradient id="selected-crown-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0f766e" />
              <stop offset="30%" stopColor="#14b8a6" />
              <stop offset="70%" stopColor="#2dd4bf" />
              <stop offset="100%" stopColor="#5eead4" />
            </linearGradient>

            {/* Selected Root Shading Gradient */}
            <linearGradient id="selected-root-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#042f2e" stopOpacity="0.75" />
              <stop offset="55%" stopColor="#115e59" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0.1" />
            </linearGradient>
          </defs>

          {/* Corner Quadrant Labels (Teal Pill/Badge Style matching Selected badges) */}
          {/* Q1 Upper Right (Top-Left) */}
          <g className="select-none pointer-events-none">
            <rect
              x="14"
              y="-42"
              width="108"
              height="20"
              rx="10"
              fill="rgba(20, 184, 166, 0.1)"
              stroke="rgba(20, 184, 166, 0.4)"
              strokeWidth="1"
            />
            <text
              x="68"
              y="-28"
              textAnchor="middle"
              fontSize="10.5"
              fontFamily="monospace"
              fontWeight="600"
              fill="rgb(94, 234, 212)"
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
              height="20"
              rx="10"
              fill="rgba(20, 184, 166, 0.1)"
              stroke="rgba(20, 184, 166, 0.4)"
              strokeWidth="1"
            />
            <text
              x="827"
              y="-28"
              textAnchor="middle"
              fontSize="10.5"
              fontFamily="monospace"
              fontWeight="600"
              fill="rgb(94, 234, 212)"
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
              height="20"
              rx="10"
              fill="rgba(20, 184, 166, 0.1)"
              stroke="rgba(20, 184, 166, 0.4)"
              strokeWidth="1"
            />
            <text
              x="68"
              y="210"
              textAnchor="middle"
              fontSize="10.5"
              fontFamily="monospace"
              fontWeight="600"
              fill="rgb(94, 234, 212)"
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
              height="20"
              rx="10"
              fill="rgba(20, 184, 166, 0.1)"
              stroke="rgba(20, 184, 166, 0.4)"
              strokeWidth="1"
            />
            <text
              x="827"
              y="210"
              textAnchor="middle"
              fontSize="10.5"
              fontFamily="monospace"
              fontWeight="600"
              fill="rgb(94, 234, 212)"
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
