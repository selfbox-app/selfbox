export function TextPreview({
  content,
  name,
}: {
  content: string | null;
  name: string;
}) {
  const text = content ?? "";
  const lines = text.split("\n");
  const gutterWidth = `${String(lines.length).length + 1}ch`;

  if (!text) {
    return (
      <div className="rounded-lg border bg-muted/30 flex items-center justify-center min-h-[40vh]">
        <p className="text-sm text-muted-foreground">Empty file</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/50">
        <span className="text-xs text-muted-foreground font-mono">{name}</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {lines.length} {lines.length === 1 ? "line" : "lines"}
        </span>
      </div>
      <div className="overflow-auto max-h-full">
        <pre className="text-sm font-mono leading-6">
          {lines.map((line, i) => (
            <div key={i} className="flex hover:bg-muted/30 transition-colors">
              <span
                className="text-muted-foreground/40 select-none text-right px-3 shrink-0 border-r border-border/50"
                style={{ minWidth: gutterWidth }}
              >
                {i + 1}
              </span>
              <span className="px-4 whitespace-pre-wrap break-all flex-1">
                {line || " "}
              </span>
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}
