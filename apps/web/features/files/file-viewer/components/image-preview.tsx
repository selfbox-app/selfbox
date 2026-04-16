export function ImagePreview({ url, name }: { url: string | null; name: string }) {
  if (!url) return null;
  return (
    <div
      className="rounded-lg border flex items-center justify-center min-h-[60vh] p-4"
      style={{
        backgroundImage:
          "repeating-conic-gradient(#80808012 0% 25%, transparent 0% 50%)",
        backgroundSize: "20px 20px",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={name}
        className="max-w-full max-h-full object-contain rounded"
      />
    </div>
  );
}
