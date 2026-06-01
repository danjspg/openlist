import { getResendClient } from "@/lib/resend"
import {
  formatViewingDateTime,
  formatViewingTime,
  getGoogleMapsUrl,
  type ViewingRow,
} from "@/lib/viewings"

const disclaimer =
  "OpenList helps users arrange and remember viewing appointments. OpenList does not act as an estate agent, auctioneer, broker, legal adviser or transaction manager."

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function formatMultiline(value: string) {
  return escapeHtml(value).replace(/\n/g, "<br />")
}

function escapeIcsText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n")
}

function formatIcsDate(value: Date) {
  return value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")
}

function foldIcsLine(line: string) {
  const chunks: string[] = []
  let remaining = line

  while (remaining.length > 75) {
    chunks.push(remaining.slice(0, 75))
    remaining = ` ${remaining.slice(75)}`
  }

  chunks.push(remaining)
  return chunks.join("\r\n")
}

function buildViewingCalendarAttachment(viewing: ViewingRow) {
  const startsAt = new Date(viewing.viewing_starts_at)
  const endsAt = new Date(startsAt.getTime() + 45 * 60 * 1000)
  const createdAt = viewing.created_at ? new Date(viewing.created_at) : new Date()
  const summary = `Property viewing: ${viewing.property_location.split("\n")[0]}`
  const mapsUrl = getGoogleMapsUrl(viewing.property_location)
  const descriptionParts = [
    `Viewer: ${viewing.viewer_name} (${viewing.viewer_email})`,
    `Seller contact: ${viewing.contact_name} (${viewing.contact_email})`,
    `Map: ${mapsUrl}`,
    viewing.notes ? `Notes: ${viewing.notes}` : "",
    disclaimer,
  ].filter(Boolean)
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//OpenList//Viewing Planner//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${viewing.id}@openlist.ie`,
    `DTSTAMP:${formatIcsDate(new Date())}`,
    `DTSTART:${formatIcsDate(startsAt)}`,
    `DTEND:${formatIcsDate(endsAt)}`,
    `CREATED:${formatIcsDate(createdAt)}`,
    `SUMMARY:${escapeIcsText(summary)}`,
    `LOCATION:${escapeIcsText(viewing.property_location)}`,
    `DESCRIPTION:${escapeIcsText(descriptionParts.join("\n"))}`,
    `URL:${mapsUrl}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ]

  return {
    filename: "openlist-viewing.ics",
    content: Buffer.from(lines.map(foldIcsLine).join("\r\n"), "utf8").toString("base64"),
  }
}

function renderShell({
  title,
  intro,
  body,
}: {
  title: string
  intro: string
  body: string
}) {
  return `
    <div style="margin:0; padding:0; background:#fafaf9;">
      <div style="max-width:640px; margin:0 auto; padding:28px 18px; font-family:Arial, Helvetica, sans-serif; color:#1c1917;">
        <div style="background:#ffffff; border:1px solid #e7e5e4; border-radius:18px; overflow:hidden;">
          <div style="padding:26px 28px; border-bottom:1px solid #e7e5e4;">
            <img src="https://www.openlist.ie/logo.png?v=3" alt="OpenList" width="130" style="display:block; border:0; margin-bottom:20px;" />
            <h1 style="margin:0; font-size:26px; line-height:1.25; color:#1c1917;">${title}</h1>
            <p style="margin:14px 0 0 0; font-size:15px; line-height:1.7; color:#57534e;">${intro}</p>
          </div>
          <div style="padding:26px 28px;">
            ${body}
          </div>
          <div style="padding:18px 28px; border-top:1px solid #e7e5e4; font-size:12px; line-height:1.6; color:#78716c;">
            ${escapeHtml(disclaimer)}
          </div>
        </div>
      </div>
    </div>
  `
}

function detail(label: string, value: string) {
  return `
    <div style="margin-bottom:18px;">
      <div style="font-size:12px; letter-spacing:0.12em; text-transform:uppercase; font-weight:700; color:#78716c; margin-bottom:6px;">${label}</div>
      <div style="font-size:15px; line-height:1.7; color:#1c1917;">${value}</div>
    </div>
  `
}

function getSharedBody(
  viewing: ViewingRow,
  extra?: string,
  options: { showCalendarNotice?: boolean } = {}
) {
  const viewerPhone = viewing.viewer_phone
    ? `<br />${escapeHtml(viewing.viewer_phone)}`
    : ""
  const contactPhone = viewing.contact_phone
    ? `<br />${escapeHtml(viewing.contact_phone)}`
    : ""
  const notes = viewing.notes?.trim()
    ? detail("Notes", formatMultiline(viewing.notes.trim()))
    : ""
  const mapsUrl = getGoogleMapsUrl(viewing.property_location)

  return `
    ${detail("When", escapeHtml(formatViewingDateTime(viewing.viewing_starts_at)))}
    ${detail(
      "Location",
      `${formatMultiline(viewing.property_location)}
      <div style="margin-top:10px;">
        <a href="${mapsUrl}" style="display:inline-block; color:#1c1917; font-size:14px; font-weight:700; text-decoration:underline;">Open in Google Maps</a>
      </div>`
    )}
    ${detail(
      "Viewer",
      `<strong>${escapeHtml(viewing.viewer_name)}</strong><br /><a href="mailto:${escapeHtml(viewing.viewer_email)}" style="color:#1c1917; text-decoration:none;">${escapeHtml(viewing.viewer_email)}</a>${viewerPhone}`
    )}
    ${detail(
      "Seller contact",
      `<strong>${escapeHtml(viewing.contact_name)}</strong><br /><a href="mailto:${escapeHtml(viewing.contact_email)}" style="color:#1c1917; text-decoration:none;">${escapeHtml(viewing.contact_email)}</a>${contactPhone}`
    )}
    ${notes}
    ${
      options.showCalendarNotice
        ? `<div style="margin:22px 0; padding:16px; border:1px solid #e7e5e4; border-radius:16px; background:#fafaf9;">
          <div style="font-size:14px; line-height:1.6; color:#1c1917; font-weight:700;">Add to calendar</div>
          <div style="margin-top:4px; font-size:13px; line-height:1.6; color:#57534e;">
            A calendar invite is attached to this email.
          </div>
        </div>`
        : ""
    }
    ${
      extra
        ? `<p style="margin:22px 0 0 0; font-size:14px; line-height:1.7; color:#57534e;">${extra}</p>`
        : ""
    }
  `
}

export function getViewingConfirmationSubject(viewing: ViewingRow) {
  const location = viewing.property_location.split("\n")[0]
  return `Viewing confirmed: ${location} on ${formatViewingDateTime(viewing.viewing_starts_at)}`
}

export function getViewingReminderSubject(viewing: ViewingRow) {
  return `Reminder: viewing tomorrow at ${formatViewingTime(viewing.viewing_starts_at)}`
}

export function getViewingCancellationSubject(viewing: ViewingRow) {
  return `Viewing cancelled: ${viewing.property_location.split("\n")[0]}`
}

export function getViewingUpdateSubject(viewing: ViewingRow) {
  return `Viewing updated: ${viewing.property_location.split("\n")[0]} on ${formatViewingDateTime(viewing.viewing_starts_at)}`
}

export function renderViewingConfirmationEmailHtml(viewing: ViewingRow) {
  return renderShell({
    title: "Viewing confirmed",
    intro: "Here are the viewing details.",
    body: getSharedBody(
      viewing,
      "OpenList will send a reminder 1 day before the appointment. Please reply directly if anything changes.",
      { showCalendarNotice: true }
    ),
  })
}

export function renderViewingReminderEmailHtml(viewing: ViewingRow) {
  return renderShell({
    title: "Viewing reminder",
    intro: "This is a reminder for tomorrow's viewing.",
    body: getSharedBody(
      viewing,
      "Please reply directly if anything has changed.",
      { showCalendarNotice: true }
    ),
  })
}

export function renderViewingCancellationEmailHtml(viewing: ViewingRow) {
  return renderShell({
    title: "Viewing cancelled",
    intro: "The viewing appointment has been cancelled.",
    body: getSharedBody(
      viewing,
      "This viewing has been cancelled. Please reply directly if you need to arrange another time."
    ),
  })
}

export function renderViewingUpdateEmailHtml(viewing: ViewingRow) {
  return renderShell({
    title: "Viewing updated",
    intro: "The viewing appointment details have been updated.",
    body: getSharedBody(
      viewing,
      "Please use these latest details for the viewing. OpenList will send a reminder 1 day before the appointment if reminders are enabled.",
      { showCalendarNotice: true }
    ),
  })
}

async function sendViewingEmail({
  to,
  replyTo,
  subject,
  html,
  viewing,
}: {
  to: string
  replyTo?: string
  subject: string
  html: string
  viewing?: ViewingRow
}) {
  const from = process.env.RESEND_FROM_EMAIL
  const bccEmail =
    process.env.VIEWING_EMAIL_BCC?.trim().toLowerCase() ||
    process.env.ADMIN_NOTIFICATION_EMAIL?.trim().toLowerCase()
  const recipient = to.trim().toLowerCase()

  if (!process.env.RESEND_API_KEY) {
    throw new Error("Missing RESEND_API_KEY in environment variables")
  }

  if (!from) {
    throw new Error("Missing RESEND_FROM_EMAIL in environment variables")
  }

  const result = await getResendClient().emails.send({
    from,
    to: [to],
    bcc: bccEmail && bccEmail !== recipient ? [bccEmail] : undefined,
    replyTo,
    subject,
    html,
    attachments: viewing ? [buildViewingCalendarAttachment(viewing)] : undefined,
  })

  if ("error" in result && result.error) {
    throw new Error(`Resend failed: ${result.error.message}`)
  }
}

export async function sendViewingConfirmationEmails(viewing: ViewingRow) {
  const subject = getViewingConfirmationSubject(viewing)
  const html = renderViewingConfirmationEmailHtml(viewing)
  const emailTasks = []

  if (viewing.send_confirmation_to_viewer !== false) {
    emailTasks.push(sendViewingEmail({
      to: viewing.viewer_email,
      replyTo: viewing.contact_email,
      subject,
      html,
      viewing,
    }))
  }

  if (viewing.send_confirmation_to_seller !== false) {
    emailTasks.push(sendViewingEmail({
      to: viewing.contact_email,
      replyTo: viewing.viewer_email,
      subject,
      html,
      viewing,
    }))
  }

  await Promise.all(emailTasks)
}

export async function sendViewingReminderEmails(viewing: ViewingRow) {
  const subject = getViewingReminderSubject(viewing)
  const html = renderViewingReminderEmailHtml(viewing)
  const emailTasks = []

  if (viewing.send_reminder_to_viewer !== false) {
    emailTasks.push(sendViewingEmail({
      to: viewing.viewer_email,
      replyTo: viewing.contact_email,
      subject,
      html,
      viewing,
    }))
  }

  if (viewing.send_reminder_to_seller !== false) {
    emailTasks.push(sendViewingEmail({
      to: viewing.contact_email,
      replyTo: viewing.viewer_email,
      subject,
      html,
      viewing,
    }))
  }

  await Promise.all(emailTasks)
}

export async function sendViewingCancellationEmails(viewing: ViewingRow) {
  const subject = getViewingCancellationSubject(viewing)
  const html = renderViewingCancellationEmailHtml(viewing)

  await Promise.all([
    sendViewingEmail({
      to: viewing.viewer_email,
      replyTo: viewing.contact_email,
      subject,
      html,
    }),
    sendViewingEmail({
      to: viewing.contact_email,
      replyTo: viewing.viewer_email,
      subject,
      html,
    }),
  ])
}

export async function sendViewingUpdateEmails(
  viewing: ViewingRow,
  options: { toViewer: boolean; toSeller: boolean }
) {
  const subject = getViewingUpdateSubject(viewing)
  const html = renderViewingUpdateEmailHtml(viewing)
  const emailTasks = []

  if (options.toViewer) {
    emailTasks.push(sendViewingEmail({
      to: viewing.viewer_email,
      replyTo: viewing.contact_email,
      subject,
      html,
      viewing,
    }))
  }

  if (options.toSeller) {
    emailTasks.push(sendViewingEmail({
      to: viewing.contact_email,
      replyTo: viewing.viewer_email,
      subject,
      html,
      viewing,
    }))
  }

  await Promise.all(emailTasks)
}
