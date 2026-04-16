"use client";

import { useRef, useEffect, useState, type ReactNode } from "react";
import { draggable } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { cn } from "@/lib/utils";

interface DraggableFileRowProps {
  fileId: string;
  fileName: string;
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
  children: ReactNode;
}

export function DraggableFileRow({
  fileId,
  fileName,
  onClick,
  className,
  children,
}: DraggableFileRowProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    return draggable({
      element: el,
      getInitialData: () => ({
        id: fileId,
        type: "file" as const,
        name: fileName,
      }),
      onDragStart: () => setIsDragging(true),
      onDrop: () => setIsDragging(false),
    });
  }, [fileId, fileName]);

  return (
    <div
      ref={ref}
      onClick={onClick}
      className={cn(className, isDragging && "opacity-40")}
    >
      {children}
    </div>
  );
}
