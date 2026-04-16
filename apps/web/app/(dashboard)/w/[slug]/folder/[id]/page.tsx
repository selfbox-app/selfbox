import { FileExplorer } from "@/features/files/file-explorer";

export default async function FolderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <FileExplorer folderId={id} />;
}
