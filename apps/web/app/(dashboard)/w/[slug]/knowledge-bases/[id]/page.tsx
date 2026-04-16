"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { KBDetailPage } from "@/features/knowledge-bases/kb-detail";

export default function KnowledgeBaseDetailPage() {
  const params = useParams();
  const id = params.id as string;
  return (
    <Suspense>
      <KBDetailPage id={id} />
    </Suspense>
  );
}
