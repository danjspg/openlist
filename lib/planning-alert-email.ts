import { getPlanningAuthorityByCode } from "@/lib/planning-authorities"
import { planningAlertEventTitle } from "@/lib/planning-alert-delivery-rules"
import { createPlanningAlertUnsubscribeToken } from "@/lib/planning-alert-unsubscribe"
import { planningApplicationPath } from "@/lib/property-intelligence"
import { getResendClient } from "@/lib/resend"
import { getPublicSiteUrl } from "@/lib/site-url"

const authoritativeSourceDisclaimer =
  "OpenList helps you follow this application. The relevant local authority remains the authoritative source for the planning record."

export type PlanningAlertEmailDelivery = {
  delivery_id: string
  subscription_id: string
  event_type: string
  event_date: string
  event_label: string
  old_value: string | null
  new_value: string | null
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
    .replace(/"/g, "&quot;")
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

function emailLinks(delivery: PlanningAlertEmailDelivery) {
  const authority = getPlanningAuthorityByCode(delivery.local_authority_code)
  if (!authority) throw new Error(`Unknown planning authority ${delivery.local_authority_code}`)
  const siteUrl = getPublicSiteUrl()
  const applicationUrl = `${siteUrl}${planningApplicationPath(authority, delivery.application_reference)}`
  const token = createPlanningAlertUnsubscribeToken(delivery.subscription_id)
  const unsubscribeUrl = `${siteUrl}/planning-alerts/unsubscribe?token=${encodeURIComponent(token)}`
  return { applicationUrl, unsubscribeUrl }
}

export function renderPlanningAlertEmail(delivery: PlanningAlertEmailDelivery) {
  const title = planningAlertEventTitle(delivery.event_type, delivery.event_label)
  const { applicationUrl, unsubscribeUrl } = emailLinks(delivery)
  const plainReference = delivery.application_reference.replace(/\s+/g, " ").trim()
  const reference = escapeHtml(plainReference)
  const proposal = delivery.proposal?.trim() ? escapeHtml(delivery.proposal.trim()) : null
  const location = delivery.location?.trim() ? escapeHtml(delivery.location.trim()) : null
  const detail = delivery.event_label?.trim() ? escapeHtml(delivery.event_label.trim()) : escapeHtml(title)
  const subject = `${title.replace(/\s+/g, " ").trim()}: ${plainReference}`
  const text = [
    title,
    `Planning reference: ${delivery.application_reference}`,
    `Update date: ${formatDate(delivery.event_date)}`,
    delivery.event_label,
    delivery.location ? `Location: ${delivery.location}` : "",
    delivery.proposal ? `Proposal: ${delivery.proposal}` : "",
    `View application: ${applicationUrl}`,
    `Stop these updates: ${unsubscribeUrl}`,
    authoritativeSourceDisclaimer,
    "This is a free service email you requested from OpenList, not a marketing email.",
  ].filter(Boolean).join("\n\n")

  const html = `
    <div style="margin:0; padding:0; background:#fafaf9;">
      <div style="max-width:640px; margin:0 auto; padding:28px 18px; font-family:Arial, Helvetica, sans-serif; color:#1c1917;">
        <div style="background:#ffffff; border:1px solid #e7e5e4; border-radius:18px; overflow:hidden;">
          <div style="padding:26px 28px; border-bottom:1px solid #e7e5e4;">
            <div style="margin-bottom:20px; font-size:20px; font-weight:700; letter-spacing:-0.02em; color:#1c1917;">OpenList</div>
            <div style="font-size:12px; letter-spacing:0.12em; text-transform:uppercase; font-weight:700; color:#047857;">Planning update</div>
            <h1 style="margin:10px 0 0; font-size:26px; line-height:1.25; color:#1c1917;">${escapeHtml(title)}</h1>
          </div>
          <div style="padding:26px 28px;">
            <p style="margin:0; font-size:15px; line-height:1.7; color:#1c1917;">${detail}</p>
            <div style="margin:22px 0; padding:18px; border:1px solid #e7e5e4; border-radius:14px; background:#fafaf9;">
              <div style="font-size:12px; text-transform:uppercase; font-weight:700; color:#78716c;">Planning reference</div>
              <div style="margin-top:5px; font-size:16px; font-weight:700;">${reference}</div>
              <div style="margin-top:12px; font-size:14px; line-height:1.6; color:#57534e;">Update date: ${escapeHtml(formatDate(delivery.event_date))}</div>
              ${location ? `<div style="margin-top:12px; font-size:14px; line-height:1.6;"><strong>Location:</strong> ${location}</div>` : ""}
              ${proposal ? `<div style="margin-top:12px; font-size:14px; line-height:1.6;"><strong>Proposal:</strong> ${proposal}</div>` : ""}
            </div>
            <a href="${applicationUrl}" style="display:inline-block; padding:13px 18px; border-radius:10px; background:#047857; color:#ffffff; font-size:14px; font-weight:700; text-decoration:none;">View planning application</a>
          </div>
          <div style="padding:18px 28px; border-top:1px solid #e7e5e4; font-size:12px; line-height:1.7; color:#78716c;">
            <div style="margin-bottom:8px;">${authoritativeSourceDisclaimer}</div>
            This is a free service email you requested from OpenList, not a marketing email.
            <a href="${unsubscribeUrl}" style="color:#57534e; text-decoration:underline;">Stop updates for this application</a>.
          </div>
        </div>
      </div>
    </div>
  `

  return { subject, html, text, applicationUrl, unsubscribeUrl }
}

export async function sendPlanningAlertEmail(
  delivery: PlanningAlertEmailDelivery,
  recipient: string
) {
  const from = process.env.RESEND_FROM_EMAIL?.trim()
  if (!from) throw new Error("RESEND_FROM_EMAIL is required")
  const email = renderPlanningAlertEmail(delivery)
  const result = await getResendClient().emails.send(
    {
      from,
      to: [recipient],
      subject: email.subject,
      html: email.html,
      text: email.text,
    },
    { idempotencyKey: `planning-alert/${delivery.delivery_id}` }
  )
  if (result.error) throw new Error(`Resend failed: ${result.error.message}`)
  if (!result.data?.id) throw new Error("Resend returned no message ID")
  return result.data.id
}
