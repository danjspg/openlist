"use server"

import { supabase } from "@/lib/supabase"
import { getResendClient } from "@/lib/resend"
import { getDisplayListingTitle } from "@/lib/listings"

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

function renderEmailShell({
  eyebrow,
  title,
  intro,
  content,
  footer,
}: {
  eyebrow: string
  title: string
  intro: string
  content: string
  footer: string
}) {
  return `
    <div style="margin:0; padding:0; background:#f8fafc;">
      <div style="max-width:640px; margin:0 auto; padding:32px 20px; font-family:Arial, Helvetica, sans-serif; color:#0f172a;">
        <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:20px; overflow:hidden;">

          <div style="padding:28px; background:linear-gradient(180deg, #f8fafc 0%, #ffffff 100%); border-bottom:1px solid #e2e8f0;">

            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:18px;">
              <tr>
                <td style="vertical-align:middle; padding-right:12px;">
                  <img
                    src="https://www.openlist.ie/logo.png?v=3"
                    alt="OpenList"
                    width="140"
                    style="display:block; border:0; outline:none; text-decoration:none;"
                  />
                </td>
                <td style="vertical-align:middle;">
                  <div style="font-size:14px; letter-spacing:0.18em; text-transform:uppercase; font-weight:700; color:#64748b;">
                    OpenList
                  </div>
                </td>
              </tr>
            </table>

            <div style="font-size:12px; letter-spacing:0.14em; text-transform:uppercase; font-weight:700; color:#64748b; margin-bottom:10px;">
              ${eyebrow}
            </div>

            <h1 style="margin:0; font-size:28px; line-height:1.2; font-weight:700; color:#0f172a;">
              ${title}
            </h1>

            <p style="margin:14px 0 0 0; font-size:15px; line-height:1.7; color:#475569;">
              ${intro}
            </p>
          </div>

          <div style="padding:28px;">
            ${content}
          </div>

          <div style="padding:20px 28px; border-top:1px solid #e2e8f0;">
            ${footer}
          </div>

        </div>
      </div>
    </div>
  `
}

function detailBlock(label: string, value: string) {
  return `
    <div style="margin-bottom:24px;">
      <div style="font-size:12px; letter-spacing:0.14em; text-transform:uppercase; font-weight:700; color:#64748b; margin-bottom:8px;">
        ${label}
      </div>
      <div style="font-size:15px; line-height:1.8; color:#0f172a;">
        ${value}
      </div>
    </div>
  `
}

function messageBlock(label: string, value: string) {
  return `
    <div style="margin-bottom:24px;">
      <div style="font-size:12px; letter-spacing:0.14em; text-transform:uppercase; font-weight:700; color:#64748b; margin-bottom:8px;">
        ${label}
      </div>
      <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:16px; padding:18px; font-size:15px; line-height:1.8; color:#334155;">
        ${value}
      </div>
    </div>
  `
}

function ctaBlock(url: string) {
  return `
    <div style="margin-top:28px;">
      <a
        href="${url}"
        style="display:inline-block; background:#0f172a; color:#ffffff; text-decoration:none; font-size:14px; font-weight:700; padding:14px 20px; border-radius:999px;"
      >
        View listing
      </a>
    </div>

    <p style="margin:14px 0 0 0; font-size:13px; line-height:1.7; color:#64748b;">
      <a href="${url}" style="color:#64748b; text-decoration:underline;">${url}</a>
    </p>
  `
}

export async function submitEnquiry(formData: FormData) {
  const listingSlug = String(formData.get("listingSlug") ?? "").trim()
  const listingTitle = String(formData.get("listingTitle") ?? "").trim()
  const name = String(formData.get("name") ?? "").trim()
  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  const phone = String(formData.get("phone") ?? "").trim()
  const message = String(formData.get("message") ?? "").trim()

  if (!listingSlug || !listingTitle || !name || !email || !message) {
    return {
      success: false,
      error: "Please complete all required fields.",
    }
  }

  const { data: listing, error: listingError } = await supabase
    .from("listings")
    .select("seller_name,seller_email,title,public_title")
    .eq("slug", listingSlug)
    .maybeSingle()

  if (listingError) {
    return {
      success: false,
      error: `Could not load listing: ${listingError.message}`,
    }
  }

  if (!listing?.seller_email) {
    return {
      success: false,
      error: "This listing does not have a seller email configured yet.",
    }
  }

  const sellerEmail = String(listing.seller_email).trim().toLowerCase()
  const sellerName = String(listing.seller_name ?? "").trim()
  const publicListingTitle = getDisplayListingTitle(listing)

  const { error: insertError } = await supabase.from("enquiries").insert({
    listing_slug: listingSlug,
    listing_title: publicListingTitle || listingTitle,
    name,
    email,
    phone: phone || null,
    message,
  })

  if (insertError) {
    return {
      success: false,
      error: `Supabase insert failed: ${insertError.message}`,
    }
  }

  const resendFromEmail = process.env.RESEND_FROM_EMAIL
  const resendApiKey = process.env.RESEND_API_KEY
  const adminNotificationEmail =
    process.env.ADMIN_NOTIFICATION_EMAIL?.trim().toLowerCase()

  const enquiryUrl = `https://www.openlist.ie/listings/${listingSlug}`

  if (!resendApiKey) {
    return {
      success: false,
      error: "Missing RESEND_API_KEY in environment variables",
    }
  }

  if (!resendFromEmail) {
    return {
      success: false,
      error: "Missing RESEND_FROM_EMAIL in environment variables",
    }
  }

  const safeListingTitle = escapeHtml(listingTitle)
  const safeName = escapeHtml(name)
  const safeEmail = escapeHtml(email)
  const safePhone = phone ? escapeHtml(phone) : "Phone not provided"
  const safeMessage = formatMultiline(message)
  const safeEnquiryUrl = escapeHtml(enquiryUrl)
  const safeSellerName = sellerName ? escapeHtml(sellerName) : "the seller"

  const sellerContent = `
    <div style="margin-bottom:24px;">
      <div style="font-size:12px; letter-spacing:0.14em; text-transform:uppercase; font-weight:700; color:#64748b; margin-bottom:8px;">
        Property
      </div>
      <div style="font-size:22px; line-height:1.35; font-weight:700; color:#0f172a;">
        ${safeListingTitle}
      </div>
    </div>

    ${detailBlock(
      "Buyer",
      `<strong>${safeName}</strong><br />
      <a href="mailto:${safeEmail}" style="color:#0f172a; text-decoration:none;">${safeEmail}</a><br />
      ${safePhone}`
    )}

    ${messageBlock("Message", safeMessage)}

    ${ctaBlock(safeEnquiryUrl)}
  `

  const buyerContent = `
    <div style="margin-bottom:24px;">
      <div style="font-size:12px; letter-spacing:0.14em; text-transform:uppercase; font-weight:700; color:#64748b; margin-bottom:8px;">
        Property
      </div>
      <div style="font-size:22px; line-height:1.35; font-weight:700; color:#0f172a;">
        ${safeListingTitle}
      </div>
    </div>

    <div style="margin-bottom:24px; font-size:15px; line-height:1.8; color:#475569;">
      The private seller, ${safeSellerName}, should come back to you using the contact details below.
    </div>

    ${detailBlock(
      "Your details",
      `<strong>${safeName}</strong><br />
      <a href="mailto:${safeEmail}" style="color:#0f172a; text-decoration:none;">${safeEmail}</a><br />
      ${safePhone}`
    )}

    ${messageBlock("Your message", safeMessage)}

    ${ctaBlock(safeEnquiryUrl)}
  `

  const sellerEmailHtml = renderEmailShell({
    eyebrow: "New enquiry",
    title: "New enquiry received",
    intro: sellerName
      ? `You’ve received a new enquiry for ${safeSellerName}'s private sale listing.`
      : "You’ve received a new enquiry for your private sale listing.",
    content: sellerContent,
    footer: `
      <p style="margin:0; font-size:13px; color:#64748b;">
        Reply directly to this email to respond to the buyer.
      </p>
      <p style="margin:12px 0 0 0; font-size:12px; color:#94a3b8;">
        This enquiry was sent via OpenList, a platform for private property listings in Ireland. OpenList does not act as an estate agent.
      </p>
    `,
  })

  const buyerConfirmationHtml = renderEmailShell({
    eyebrow: "Enquiry sent",
    title: "Your enquiry has been sent",
    intro: sellerName
      ? `Thanks ${safeName} — we’ve sent your enquiry directly to ${safeSellerName}.`
      : `Thanks ${safeName} — we’ve sent your enquiry directly to the private seller.`,
    content: buyerContent,
    footer: `
      <p style="margin:0; font-size:13px; color:#64748b;">
        This is an automated confirmation from OpenList.
      </p>
      <p style="margin:12px 0 0 0; font-size:12px; color:#94a3b8;">
        OpenList is a platform for private property listings in Ireland and does not act as an estate agent.
      </p>
    `,
  })

  try {
    const resend = getResendClient()

    const sellerResult = await resend.emails.send({
      from: resendFromEmail,
      to: [sellerEmail],
      bcc:
        adminNotificationEmail && adminNotificationEmail !== sellerEmail
          ? [adminNotificationEmail]
          : undefined,
      replyTo: email,
      subject: `New enquiry for ${listingTitle}`,
      html: sellerEmailHtml,
    })

    if ("error" in sellerResult && sellerResult.error) {
      return {
        success: false,
        error: `Resend failed: ${sellerResult.error.message}`,
      }
    }

    const buyerResult = await resend.emails.send({
      from: resendFromEmail,
      to: [email],
      subject: "Your enquiry has been sent – OpenList",
      html: buyerConfirmationHtml,
    })

    if ("error" in buyerResult && buyerResult.error) {
      return {
        success: false,
        error: `Resend failed: ${buyerResult.error.message}`,
      }
    }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown email sending error"
    return {
      success: false,
      error: `Unexpected Resend failure: ${message}`,
    }
  }

  return { success: true }
}
