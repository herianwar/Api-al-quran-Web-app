import type { CSSProperties } from "react";

interface Props {
  className?: string;
  width?: string | number;
  height?: string | number;
  rounded?: "sm" | "md" | "lg" | "xl" | "full";
}

const ROUNDED: Record<NonNullable<Props["rounded"]>, string> = {
  sm: "rounded",
  md: "rounded-md",
  lg: "rounded-lg",
  xl: "rounded-xl",
  full: "rounded-full",
};

/** Layout-matching shimmer placeholder. Use instead of <Spinner> when you can
 * roughly predict the final shape — gives the impression of instant load. */
export function Skeleton({
  className = "",
  width,
  height = "1rem",
  rounded = "md",
}: Props) {
  const style: CSSProperties = {
    width: typeof width === "number" ? `${width}px` : width,
    height: typeof height === "number" ? `${height}px` : height,
  };
  return (
    <span
      aria-hidden
      className={`skeleton block ${ROUNDED[rounded]} ${className}`}
      style={style}
    />
  );
}

/** Pre-composed skeleton for a SurahCard / list row. */
export function CardRowSkeleton() {
  return (
    <div className="card p-4 flex items-center gap-4">
      <Skeleton width={48} height={48} rounded="lg" />
      <div className="flex-1 space-y-2">
        <Skeleton width="55%" height={14} />
        <Skeleton width="35%" height={12} />
      </div>
      <Skeleton width={40} height={16} />
    </div>
  );
}

/** Stacked text-block skeleton (heading + 3 lines). */
export function TextBlockSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2.5">
      <Skeleton width="40%" height={18} />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} width={i === lines - 1 ? "70%" : "100%"} height={12} />
      ))}
    </div>
  );
}
