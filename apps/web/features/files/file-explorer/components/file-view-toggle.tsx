import { ToggleSwitch } from "@/components/toggle-switch";
import { LayoutGrid, Rows4 } from "lucide-react";

export function FileViewToggle({
  onChange,
  fileView,
  className,
}: {
  onChange: (v: "row" | "grid") => void;
  fileView: "row" | "grid";
  className?: string;
}) {
  return (
    <ToggleSwitch
      className={className}
      onChange={(v) => onChange(v)}
      options={[
        {
          icon: Rows4,
          value: "row",
        },
        {
          icon: LayoutGrid,
          value: "grid",
        },
      ]}
      value={fileView}
    />
  );
}
