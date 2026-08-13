import * as React from "react";

interface TooltipProps {
  content: string;
  children: React.ReactElement;
  disabled?: boolean;
}

export function Tooltip({ content, children, disabled }: TooltipProps) {
  const [visible, setVisible] = React.useState(false);

  if (disabled) return children;

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2.5 py-1 text-xs font-normal text-background shadow-md z-50 pointer-events-none">
          {content}
        </div>
      )}
    </div>
  );
}
