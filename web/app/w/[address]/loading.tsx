function Block({ className }: { className: string }) {
  return <div className={`rounded-full bg-white/[0.06] ${className}`} />
}

export default function LoadingProfile() {
  return (
    <main
      className="mx-auto flex max-w-5xl flex-col gap-6 px-4 pb-32 pt-28 md:gap-8 md:px-8 md:pt-32"
      aria-busy="true"
      aria-label="Loading profile"
    >
      <div className="panel animate-pulse p-5 md:p-10">
        <Block className="h-10 w-64" />
        <div className="mt-8 h-32 rounded-[24px] bg-white/[0.06]" />
      </div>
      <Block className="h-11 w-72" />
      <div className="grid gap-6 md:grid-cols-[1.4fr_1fr] md:gap-8">
        <div className="panel animate-pulse p-5 md:p-8">
          <Block className="h-7 w-40" />
          <div className="mt-6 flex flex-col gap-3">
            {[5, 4, 3, 2, 1].map((row) => (
              <Block key={row} className="h-2.5" />
            ))}
          </div>
        </div>
        <div className="panel animate-pulse p-5 md:p-8">
          <Block className="h-7 w-44" />
          <div className="mt-6 size-44 rounded-2xl bg-white/[0.06]" />
        </div>
      </div>
      <div className="panel animate-pulse p-5 md:p-8">
        <Block className="h-7 w-44" />
        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {[1, 2, 3, 4].map((row) => (
            <div key={row} className="h-32 rounded-[20px] bg-white/[0.06]" />
          ))}
        </div>
      </div>
    </main>
  )
}
