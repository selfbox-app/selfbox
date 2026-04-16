import { PDFViewer } from "@/components/pdf-viewer";

export function PdfPreview({ url }: { url: string | null }) {
  if (!url) return null;
  return (
    <div style={{ height: "100%" }}>
      <PDFViewer url={url} showThumbnails={false} />
    </div>
  );
}
