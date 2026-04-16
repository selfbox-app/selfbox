export function VideoPreview({ url }: { url: string | null }) {
  if (!url) return null;
  return (
    <div className="rounded-lg border bg-black flex items-center justify-center min-h-[60vh]">
      <video src={url} controls className="max-w-full max-h-[75vh] rounded">
        Your browser does not support the video element.
      </video>
    </div>
  );
}
