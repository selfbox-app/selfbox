import { FileIcon } from "@/components/file-icon";

export function AudioPreview({
  url,
  file,
}: {
  url: string | null;
  file: { name: string; mimeType: string };
}) {
  if (!url) return null;
  return (
    <div className="rounded-lg border bg-muted/30 flex flex-col items-center justify-center min-h-[40vh] gap-6 p-8">
      <div className="size-24 rounded-2xl bg-muted flex items-center justify-center">
        <FileIcon
          name={file.name}
          mimeType={file.mimeType}
          className="size-10"
        />
      </div>
      <p className="text-sm font-medium">{file.name}</p>
      <audio src={url} controls className="w-full max-w-md">
        Your browser does not support the audio element.
      </audio>
    </div>
  );
}
