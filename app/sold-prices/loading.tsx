export default function Loading() {
  return (
    <main className="min-h-screen bg-stone-50">
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
        <div className="animate-pulse rounded-[32px] border border-stone-200 bg-white p-8 shadow-sm">
          <div className="h-4 w-40 rounded bg-stone-200" />
          <div className="mt-5 h-10 max-w-xl rounded bg-stone-200" />
          <div className="mt-5 h-20 max-w-3xl rounded bg-stone-100" />
        </div>
      </section>
    </main>
  )
}
