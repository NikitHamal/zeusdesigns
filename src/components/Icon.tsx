import type { CSSProperties } from "react";
import { MATERIAL_ICONS } from "../lib/materialIcons";
import { cn } from "../utils/cn";

/** Official Material Symbols Rounded paths, bundled by scripts/icons.mjs. Run `node scripts/icons.mjs` after adding a name. */
export function Icon({ name, size = 20, fill, className, style }: {
  name: string; size?: number; fill?: boolean; weight?: number; className?: string; style?: CSSProperties;
}) {
  const entry = MATERIAL_ICONS[name];
  const d = entry ? (fill && entry[1] ? entry[1] : entry[0]) : "";
  return (
    <svg
      aria-hidden
      viewBox="0 -960 960 960"
      width={size}
      height={size}
      fill="currentColor"
      className={cn("msr", className)}
      style={style}
      data-icon={name}
    >
      <path d={d} />
    </svg>
  );
}
