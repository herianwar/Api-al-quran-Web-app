"use client";

import { use } from "react";
import { ProductForm } from "../_form";

export default function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const num = Number(id);
  if (!Number.isFinite(num)) {
    return (
      <div className="p-8 text-sm text-rose-700">Invalid product id.</div>
    );
  }
  return <ProductForm mode="edit" id={num} />;
}
