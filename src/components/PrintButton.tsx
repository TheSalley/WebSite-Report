'use client'

export default function PrintButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      onClick={() => window.print()}
      className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary-hover"
    >
      {children}
    </button>
  )
}
