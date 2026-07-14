import type { ReactNode } from "react";
import { seoFor } from "@/lib/seo";
import { SeoJsonLd } from "@/components/SeoJsonLd";

export const generateMetadata = seoFor("/tilawah");

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <SeoJsonLd path="/tilawah" />
      {children}
    </>
  );
}
