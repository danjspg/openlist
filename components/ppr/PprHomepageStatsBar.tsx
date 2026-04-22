import Link from "next/link"
import type { PprHomepageStat } from "@/lib/ppr-analytics"

export default function PprHomepageStatsBar({ stats }: { stats: PprHomepageStat[] }) {
  if (stats.length === 0) return null

  return (
    <div className="rounded-[32px] border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {stats.map((stat) => {
            const content = (
              <div className="flex h-full flex-col rounded-[24px] border border-stone-200 bg-stone-50 px-4 py-4 transition hover:border-stone-300 hover:bg-white">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                  {stat.eyebrow}
                </p>
                <h2 className="mt-2 text-lg font-semibold tracking-tight text-stone-900">
                  {stat.title}
                </h2>
                <p className="mt-5 text-2xl font-semibold tracking-tight text-stone-900">
                  {stat.value}
                </p>
                <p className="mt-auto pt-2 text-sm leading-6 text-stone-600">{stat.detail}</p>
              </div>
            )

            return stat.href ? (
              <Link key={`${stat.eyebrow}-${stat.title}`} href={stat.href} className="block h-full">
                {content}
              </Link>
            ) : (
              <div key={`${stat.eyebrow}-${stat.title}`} className="h-full">
                {content}
              </div>
            )
          })}
        </div>
      </div>
  )
}
