import type { ReactNode } from "react";
import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { SeoJsonLd } from "@/components/SeoJsonLd";

type Params = Promise<{ nomor: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { nomor } = await params;
  return buildMetadata(`/surat/${nomor}`);
}

export default async function Layout({
  children,
  params,
}: {
  children: ReactNode;
  params: Params;
}) {
  const { nomor } = await params;
  return (
    <>
      <SeoJsonLd path={`/surat/${nomor}`} />
      {children}
    </>
  );
}
