export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-emerald-700/70">
      <span className="h-8 w-8 rounded-full border-2 border-emerald-600/30 border-t-emerald-600 animate-spin" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-md my-10 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
      {message}
    </div>
  );
}
