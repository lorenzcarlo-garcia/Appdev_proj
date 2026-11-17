export default function LoadingSpinner({ label = 'Loading...' }) {
  // Static indicator: no animation in the approved design.
  return <div role="status" className="flex items-center justify-center gap-3 px-4 py-10 text-sm text-muted"><span aria-hidden="true" className="h-4 w-4 rounded-full border-2 border-line border-t-brand" />{label}</div>;
}
