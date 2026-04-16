import {
  Code,
  File,
  FileText,
  Folder,
  Image,
  Search,
  Trash2,
  Users,
} from "lucide-react";

const sidebarFolders = [
  { name: "Documents", icon: FileText, active: true },
  { name: "Photos", icon: Image, active: false },
  { name: "Projects", icon: Code, active: false },
  { name: "Shared", icon: Users, active: false },
  { name: "Trash", icon: Trash2, active: false },
] as const;

interface MockFile {
  name: string;
  icon: typeof FileText;
  size: string;
  date: string;
}

const mockFiles: MockFile[] = [
  { name: "Q1 Report.pdf", icon: FileText, size: "2.4 MB", date: "Apr 2, 2026" },
  { name: "Vacation Photos", icon: Folder, size: "847 MB", date: "Mar 28, 2026" },
  { name: "Project Alpha", icon: Folder, size: "1.2 GB", date: "Apr 5, 2026" },
  { name: "design-v3.fig", icon: File, size: "156 MB", date: "Apr 8, 2026" },
  { name: "notes.md", icon: FileText, size: "12 KB", date: "Apr 9, 2026" },
];

function TrafficLights() {
  return (
    <div className="flex items-center gap-2">
      <span className="block h-2.5 w-2.5 rounded-full bg-red-400" />
      <span className="block h-2.5 w-2.5 rounded-full bg-yellow-400" />
      <span className="block h-2.5 w-2.5 rounded-full bg-green-400" />
    </div>
  );
}

function Sidebar() {
  return (
    <aside className="hidden md:flex flex-col w-[200px] border-r border-border bg-white/80 py-4 px-3 gap-0.5">
      <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider px-2 mb-2">
        Folders
      </span>
      {sidebarFolders.map((folder) => {
        const Icon = folder.icon;
        return (
          <div
            key={folder.name}
            className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
              folder.active
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{folder.name}</span>
          </div>
        );
      })}
    </aside>
  );
}

function FileList() {
  return (
    <div className="flex-1 bg-background p-4">
      {/* Column headers */}
      <div className="hidden sm:grid grid-cols-[1fr_80px_110px] gap-2 px-2 pb-2 border-b border-border text-xs font-mono text-muted-foreground uppercase tracking-wider">
        <span>Name</span>
        <span className="text-right">Size</span>
        <span className="text-right">Modified</span>
      </div>

      {/* File rows */}
      <ul className="divide-y divide-border/50">
        {mockFiles.map((file) => {
          const Icon = file.icon;
          return (
            <li
              key={file.name}
              className="grid grid-cols-[1fr] sm:grid-cols-[1fr_80px_110px] gap-2 items-center px-2 py-2.5 text-sm hover:bg-muted/50 rounded-md transition-colors"
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{file.name}</span>
              </span>
              <span className="hidden sm:block text-right text-xs text-muted-foreground">
                {file.size}
              </span>
              <span className="hidden sm:block text-right text-xs text-muted-foreground">
                {file.date}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SearchOverlay() {
  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-lg">
      <div className="flex items-center gap-3 bg-white border border-border rounded-lg shadow-md px-4 py-3">
        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-sm text-muted-foreground">
          Search your files...
        </span>
      </div>
    </div>
  );
}

export function HeroVisual() {
  return (
    <div className="relative w-full rounded-xl overflow-hidden border border-border shadow-sm min-h-[300px] md:min-h-[500px]">
      {/* Title bar */}
      <div className="flex items-center gap-3 bg-white border-b border-border px-4 py-3">
        <TrafficLights />
        <span className="flex-1 text-center text-sm font-mono text-muted-foreground">
          Selfbox — My Files
        </span>
        {/* Spacer to balance the traffic lights */}
        <div className="w-[52px]" />
      </div>

      {/* Body: sidebar + file list */}
      <div className="flex min-h-[250px] md:min-h-[450px]">
        <Sidebar />
        <FileList />
      </div>

      {/* Search overlay */}
      <SearchOverlay />
    </div>
  );
}
