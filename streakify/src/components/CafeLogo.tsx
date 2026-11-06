"use client";
/**
 * Shows the café's logo image. If the file is missing (e.g. you haven't
 * uploaded it yet), falls back to the café name in the brand color.
 */
import { useEffect, useRef, useState } from "react";

export function CafeLogo({ name, logoUrl, size = "md" }: { name: string; logoUrl: string | null; size?: "sm" | "md" | "lg" }) {
  const [broken, setBroken] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  // The image may fail before React is ready to hear about it, so check once on mount too.
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) setBroken(true);
  }, []);
  const h = { sm: "h-10", md: "h-16", lg: "h-24" }[size];
  const text = { sm: "text-xl", md: "text-3xl", lg: "text-5xl" }[size];
  if (!logoUrl || broken) {
    return <span className={`${text} font-bold tracking-tight text-brand-primary`}>{name}</span>;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img ref={ref} src={logoUrl} alt={name} className={`${h} w-auto object-contain`} onError={() => setBroken(true)} />
  );
}
