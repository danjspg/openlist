import { getPlanningAuthorityByCode } from "@/lib/planning-authorities"
import {
  planningAreaAlertCategoryLabel,
  planningAreaAlertRadiusLabel,
  planningAreaAlertTriggerLabel,
} from "@/lib/planning-area-alerts"
import { planningApplicationPath } from "@/lib/property-intelligence"
import { getResendClient } from "@/lib/resend"
import { getPublicSiteUrl } from "@/lib/site-url"

export type PlanningAreaAlertEmailDelivery = {
  delivery_id: string
  subscription_id: string
  event_type: string
  event_date: string
  event_label: string
  distance_m: number
  area_label: string
  area_radius_m: number
  area_category: string
  area_trigger: string
  local_authority_code: string
  application_reference: string
  proposal: string | null
  location: string | null
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function formatDate(value: string) {
  const date = new Date(`${value}T12:00:00Z`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat("en-IE", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Dublin",
  }).format(date)
}

function formatDistance(distanceM: number) {
  return distanceM < 1000 ? `${Math.max(1, Math.round(distanceM))} m` : `${(distanceM / 1000).toFixed(1)} km`
}

function alertHeadline(delivery: PlanningAreaAlertEmailDelivery) {
  const category = planningAreaAlertCategoryLabel(delivery.area_category)
  switch (delivery.area_trigger) {
    case "approved": return `${category} approved near your alert area`
    case "appealed": return `${category} appealed near your alert area`
    case "construction": return `${category}: construction started near your alert area`
    default: return `New ${category.toLocaleLowerCase("en-IE")} near your alert area`
  }
}

export function renderPlanningAreaAlertEmail(delivery: PlanningAreaAlertEmailDelivery) {
  const authority = getPlanningAuthorityByCode(delivery.local_authority_code)
  if (!authority) throw new Error(`Unknown planning authority ${delivery.local_authority_code}`)
  const siteUrl = getPublicSiteUrl()
  const applicationUrl = `${siteUrl}${planningApplicationPath(authority, delivery.application_reference)}`
  const manageUrl = `${siteUrl}/my-alerts`
  const headline = alertHeadline(delivery)
  const category = planningAreaAlertCategoryLabel(delivery.area_category)
  const radius = planningAreaAlertRadiusLabel(delivery.area_radius_m)
  const trigger = planningAreaAlertTriggerLabel(delivery.area_trigger)
  const distance = formatDistance(delivery.distance_m)
  const subject = `${headline} · ${distance} away`.slice(0, 95)
  const location = delivery.location?.trim() || null
  const proposal = delivery.proposal?.trim() || null

  const text = [
    headline,
    `${distance} from ${delivery.area_label}`,
    `Alert: ${category} · ${trigger} · within ${radius}`,
    `Planning reference: ${delivery.application_reference}`,
    `Event date: ${formatDate(delivery.event_date)}`,
    location ? `Location: ${location}` : "",
    proposal ? `Proposal: ${proposal}` : "",
    `View application: ${applicationUrl}`,
    `Manage this area alert: ${manageUrl}`,
    "The relevant planning authority remains the authoritative source for the planning record.",
    "This is a free service email you requested from OpenList, not a marketing email.",
  ].filter(Boolean).join("\n\n")

  const html = `
    <div style="margin:0;padding:0;background:#fafaf9;">
      <div style="max-width:640px;margin:0 auto;padding:28px 18px;font-family:Arial,Helvetica,sans-serif;color:#1c1917;">
        <div style="background:#fff;border:1px solid #e7e5e4;border-radius:18px;overflow:hidden;">
          <div style="padding:26px 28px;border-bottom:1px solid #e7e5e4;">
            <div style="margin-bottom:20px;font-size:20px;font-weight:700;">OpenList</div>
            <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;font-weight:700;color:#047857;">Planning near you</div>
            <h1 style="margin:10px 0 0;font-size:25px;line-height:1.3;">${escapeHtml(headline)}</h1>
            <div style="margin-top:8px;font-size:15px;color:#57534e;">${escapeHtml(distance)} from ${escapeHtml(delivery.area_label)}</div>
          </div>
          <div style="padding:26px 28px;">
            <div style="padding:17px 18px;border:1px solid #a7f3d0;border-radius:14px;background:#ecfdf5;color:#065f46;">
              <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;font-weight:700;">Your area alert</div>
              <div style="margin-top:6px;font-size:15px;line-height:1.55;font-weight:700;">${escapeHtml(category)} · ${escapeHtml(trigger)} · within ${escapeHtml(radius)}</div>
            </div>
            <div style="margin:22px 0;padding:18px;border:1px solid #e7e5e4;border-radius:14px;background:#fafaf9;">
              <div style="font-size:12px;text-transform:uppercase;font-weight:700;color:#78716c;">Planning reference</div>
              <div style="margin-top:5px;font-size:16px;font-weight:700;">${escapeHtml(delivery.application_reference)}</div>
              <div style="margin-top:12px;font-size:14px;color:#57534e;">Event date: ${escapeHtml(formatDate(delivery.event_date))}</div>
              ${location ? `<div style="margin-top:12px;font-size:14px;line-height:1.6;"><strong>Location:</strong> ${escapeHtml(location)}</div>` : ""}
              ${proposal ? `<div style="margin-top:12px;font-size:14px;line-height:1.6;"><strong>Proposal:</strong> ${escapeHtml(proposal)}</div>` : ""}
            </div>
            <a href="${applicationUrl}" style="display:inline-block;padding:13px 18px;border-radius:10px;background:#047857;color:#fff;font-size:14px;font-weight:700;text-decoration:none;">View planning application</a>
          </div>
          <div style="padding:18px 28px;border-top:1px solid #e7e5e4;font-size:12px;line-height:1.7;color:#78716c;">
            The relevant planning authority remains the authoritative source for the planning record.<br />
            This is a free service email you requested from OpenList, not a marketing email.
            <a href="${manageUrl}" style="color:#57534e;text-decoration:underline;">Manage or stop this area alert</a>.
          </div>
        </div>
      </div>
    </div>
  `

  return { subject, text, html, applicationUrl, manageUrl }
}

export async function sendPlanningAreaAlertEmail(
  delivery: PlanningAreaAlertEmailDelivery,
  recipient: string
) {
  const from = process.env.RESEND_FROM_EMAIL?.trim()
  if (!from) throw new Error("RESEND_FROM_EMAIL is required")
  const email = renderPlanningAreaAlertEmail(delivery)
  const result = await getResendClient().emails.send(
    {
      from,
      to: [recipient],
      subject: email.subject,
      html: email.html,
      text: email.text,
    },
    { idempotencyKey: `planning-area-alert/${delivery.delivery_id}` }
  )
  if (result.error) throw new Error(`Resend failed: ${result.error.message}`)
  if (!result.data?.id) throw new Error("Resend returned no message ID")
  return result.data.id
}
