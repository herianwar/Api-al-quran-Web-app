import type { ReactNode } from "react";
import { seoFor } from "@/lib/seo";
import { SeoJsonLd } from "@/components/SeoJsonLd";

export const generateMetadata = seoFor("/adzan");

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <SeoJsonLd path="/adzan" />
      {children}
    </>
  );
}
