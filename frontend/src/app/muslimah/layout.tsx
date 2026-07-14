import type { ReactNode } from "react";
import { seoFor } from "@/lib/seo";
import { SeoJsonLd } from "@/components/SeoJsonLd";

export const generateMetadata = seoFor("/muslimah");

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <SeoJsonLd path="/muslimah" />
      {children}
    </>
  );
}
