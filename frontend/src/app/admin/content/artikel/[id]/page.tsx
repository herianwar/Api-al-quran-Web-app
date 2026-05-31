"use client";

import { use } from "react";
import { ArtikelForm } from "../_form";

export default function EditArtikelPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const num = Number(id);
  if (!Number.isFinite(num)) {
    return <div className="p-8 text-sm text-rose-700">ID artikel tidak valid.</div>;
  }
  return <ArtikelForm mode="edit" id={num} />;
}
