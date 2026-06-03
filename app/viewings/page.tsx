import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { getCurrentSellerUser } from "@/lib/seller-auth"

export const metadata: Metadata = {
  title: "Property Viewing Management | OpenList",
  description:
    "Self-service property viewing tools for Ireland. Record appointments, notify participants and keep track of upcoming viewings.",
  alternates: {
    canonical: "/viewings",
  },
}

const features = [
  {
    title: "Record Viewings",
    text: "Store viewing dates, times, locations and notes in one place.",
  },
  {
    title: "Reuse Existing Appointments",
    text: "Create a new viewing from an existing one and update only the details that matter.",
  },
  {
    title: "Send Viewing Details",
    text: "Automatically send viewing information after an appointment has been recorded.",
  },
  {
    title: "Update Appointments",
    text: "Edit dates, times, locations and notes whenever plans change.",
  },
  {
    title: "Keep Track",
    text: "Maintain a clear record of upcoming and completed viewings.",
  },
]

const heroFeaturePills = [
  "Create Viewings",
  "Create Similar",
  "Notify Participants",
  "Edit Viewings",
  "Track Appointments",
]

const typicalUses = [
  "Private property sales",
  "Rental viewings",
  "Site visits",
  "Property inspections",
]

export default async function ViewingsPage() {
  const currentUser = await getCurrentSellerUser()
  const dashboardHref = "/my-viewings"
  const signInHref = "/sign-in?redirectTo=%2Fmy-viewings"
  const primaryHref = currentUser ? dashboardHref : signInHref

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:py-20">
        <div className="grid gap-10 lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:gap-12">
          <div>
            <p className="text-sm uppercase tracking-[0.25em] text-stone-500">
              PROPERTY VIEWING MANAGEMENT
            </p>
            <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-stone-900 sm:mt-5 sm:text-5xl md:text-[3.5rem] md:leading-[1.05]">
              Organise and track property viewings
            </h1>
            <p className="mt-5 max-w-[36rem] text-base leading-7 text-stone-600 sm:mt-6 sm:text-lg sm:leading-8">
              Record appointments, notify participants and keep track of upcoming viewings.
            </p>

            <div className="mt-8 flex flex-wrap gap-3 sm:mt-9 sm:gap-4">
              <Link
                href={primaryHref}
                className="rounded-full bg-stone-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-stone-700 sm:px-6"
              >
                Start managing viewings
              </Link>
              <Link
                href={signInHref}
                className="rounded-full border border-stone-300 px-5 py-3 text-sm font-medium text-stone-700 transition hover:border-stone-900 hover:text-stone-900 sm:px-6"
              >
                Sign in
              </Link>
            </div>

            <div className="mt-7 flex flex-wrap gap-2.5">
              {heroFeaturePills.map((feature) => (
                <span
                  key={feature}
                  className="inline-flex rounded-full border border-stone-200 bg-white/80 px-3.5 py-2 text-sm font-medium text-stone-700 shadow-sm"
                >
                  {feature}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-[30px] border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="rounded-[24px] bg-stone-50 p-3 sm:p-4">
              <div className="relative max-h-[560px] overflow-hidden rounded-[18px] border border-stone-200 bg-white shadow-sm lg:max-h-[520px]">
                <div className="border-b border-stone-200 px-5 py-5 sm:px-6">
                  <Image
                    src="/logo.png"
                    alt="OpenList"
                    width={130}
                    height={39}
                    className="mb-5 h-auto w-[130px]"
                  />
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                    Subject
                  </p>
                  <h2 className="mt-2 text-[26px] font-semibold leading-tight tracking-tight text-stone-900">
                    Viewing scheduled
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-stone-600">
                    Here are the viewing details recorded in OpenList.
                  </p>
                </div>

                <div className="px-5 py-5 sm:px-6">
                  <dl className="space-y-4">
                    {[
                      ["Property", "12 Willow Park, Dublin"],
                      ["Date", "Friday 5 June 2026"],
                      ["Time", "11:00 AM"],
                      ["Location", "12 Willow Park, Dublin"],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <dt className="mb-1.5 text-xs font-bold uppercase tracking-[0.12em] text-stone-500">
                          {label}
                        </dt>
                        <dd className="text-[15px] leading-7 text-stone-900">
                          {value}
                          {label === "Location" && (
                            <div className="mt-2">
                              <a
                                href="#demo-google-maps-link"
                                className="text-sm font-bold text-stone-900 underline underline-offset-2"
                              >
                                View location on Google Maps
                              </a>
                            </div>
                          )}
                        </dd>
                      </div>
                  ))}
                </dl>

                  <div className="mt-5">
                    <span className="inline-flex rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white">
                      View details
                    </span>
                  </div>
                </div>

                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white via-white/90 to-transparent" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-semibold tracking-tight text-stone-900 md:text-4xl">
            Everything included
          </h2>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <article
              key={feature.title}
              className="rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm"
            >
              <h3 className="text-xl font-semibold tracking-tight text-stone-900">
                {feature.title}
              </h3>
              <p className="mt-3 text-base leading-7 text-stone-600">
                {feature.text}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-14 sm:px-6 sm:pb-16">
        <div className="grid gap-8 rounded-[30px] border border-stone-200 bg-white p-7 shadow-sm sm:p-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight text-stone-900">
              Typical uses
            </h2>
            <p className="mt-4 text-base leading-7 text-stone-600">
              Viewing organisation tools for common property administration tasks.
            </p>
          </div>

          <ul className="grid gap-3 sm:grid-cols-2">
            {typicalUses.map((use) => (
              <li
                key={use}
                className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-base font-medium text-stone-800"
              >
                {use}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  )
}
