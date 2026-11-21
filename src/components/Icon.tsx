import type { CSSProperties } from "react";
import { cn } from "../utils/cn";

/** Material Symbols Rounded (icon font, ligatures). Names must be literals so scripts/icons.mjs can subset the font. */
export function Icon({ name, size = 20, fill, weight = 400, className, style }: {
  name: string; size?: number; fill?: boolean; weight?: number; className?: string; style?: CSSProperties;
}) {
  return (
    <span
      aria-hidden
      className={cn("msr", className)}
      style={{ fontSize: size, width: size, height: size, fontVariationSettings: `'FILL' ${fill ? 1 : 0}, 'wght' ${weight}`, ...style }}
    >
      {name}
    </span>
  );
}
