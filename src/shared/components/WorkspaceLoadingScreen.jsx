import { Loader2 } from "lucide-react";

export default function WorkspaceLoadingScreen() {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-100 text-slate-600"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <Loader2 className="h-9 w-9 animate-spin text-slate-500" aria-hidden />
      <p className="text-sm font-medium">Loading Workspace...</p>
    </div>
  );
}
