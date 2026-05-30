import type { ReactNode } from "react";
import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { SeoJsonLd } from "@/components/SeoJsonLd";

type Params = Promise<{ perawi: string; nomor: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { perawi, nomor } = await params;
  return buildMetadata(`/hadis/${perawi}/${nomor}`);
}

export default async function Layout({
  children,
  params,
}: {
  children: ReactNode;
  params: Params;
}) {
  const { perawi, nomor } = await params;
  return (
    <>
      <SeoJsonLd path={`/hadis/${perawi}/${nomor}`} />
      {children}
    </>
  );
}
