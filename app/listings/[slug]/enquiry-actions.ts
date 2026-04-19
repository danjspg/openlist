"use server"

import { supabase } from "@/lib/supabase"
import { getResendClient } from "@/lib/resend"

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
    .select("seller_email")
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

  const { error: insertError } = await supabase.from("enquiries").insert({
    listing_slug: listingSlug,
    listing_title: listingTitle,
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

  try {
    const resend = getResendClient()

    const result = await resend.emails.send({
      from: resendFromEmail,
      to: [sellerEmail],
      bcc:
        adminNotificationEmail && adminNotificationEmail !== sellerEmail
          ? [adminNotificationEmail]
          : undefined,
      replyTo: email,
      subject: `New enquiry for ${listingTitle}`,
      html: `
        <div style="margin:0; padding:0; background:#f8fafc;">
          <div style="max-width:640px; margin:0 auto; padding:32px 20px; font-family:Arial, Helvetica, sans-serif; color:#0f172a;">
            <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:20px; overflow:hidden;">

              <div style="padding:28px; background:linear-gradient(180deg, #f8fafc 0%, #ffffff 100%); border-bottom:1px solid #e2e8f0;">

                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:18px;">
                  <tr>
                    <td style="vertical-align:middle; padding-right:12px;">
                      <img
                        src="https://www.openlist.ie/logo.png"
                        alt="OpenList"
                        width="140"
                        style="display:block; border:0;"
                      />
                    </td>
                    <td style="vertical-align:middle;">
                      <div style="font-size:14px; letter-spacing:0.18em; text-transform:uppercase; font-weight:700; color:#64748b;">
                        OpenList
                      </div>
                    </td>
                  </tr>
                </table>

                <h1 style="margin:0; font-size:28px; line-height:1.2; font-weight:700; color:#0f172a;">
                  New enquiry received
                </h1>

                <p style="margin:14px 0 0 0; font-size:15px; line-height:1.7; color:#475569;">
                  You’ve received a new enquiry for your listing.
                </p>
              </div>

              <div style="padding:28px;">
                <div style="margin-bottom:24px;">
                  <div style="font-size:12px; letter-spacing:0.14em; text-transform:uppercase; font-weight:700; color:#64748b; margin-bottom:8px;">
                    Property
                  </div>
                  <div style="font-size:22px; line-height:1.35; font-weight:700; color:#0f172a;">
                    ${listingTitle}
                  </div>
                </div>

                <div style="margin-bottom:24px;">
                  <div style="font-size:12px; letter-spacing:0.14em; text-transform:uppercase; font-weight:700; color:#64748b; margin-bottom:8px;">
                    Buyer
                  </div>
                  <div style="font-size:15px; line-height:1.8; color:#0f172a;">
                    <strong>${name}</strong><br />
                    <a href="mailto:${email}" style="color:#0f172a; text-decoration:none;">${email}</a><br />
                    ${phone ? phone : "Phone not provided"}
                  </div>
                </div>

                <div style="margin-bottom:24px;">
                  <div style="font-size:12px; letter-spacing:0.14em; text-transform:uppercase; font-weight:700; color:#64748b; margin-bottom:8px;">
                    Message
                  </div>
                  <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:16px; padding:18px; font-size:15px; line-height:1.8; color:#334155; white-space:pre-wrap;">
${message}
                  </div>
                </div>

                <div style="margin-top:28px;">
                  <a
                    href="${enquiryUrl}"
                    style="display:inline-block; background:#0f172a; color:#ffffff; text-decoration:none; font-size:14px; font-weight:700; padding:14px 20px; border-radius:999px;"
                  >
                    View listing
                  </a>
                </div>

                <p style="margin:14px 0 0 0; font-size:13px; line-height:1.7; color:#64748b;">
                  <a href="${enquiryUrl}" style="color:#64748b; text-decoration:underline;">${enquiryUrl}</a>
                </p>
              </div>

              <div style="padding:20px 28px; border-top:1px solid #e2e8f0;">
                <p style="margin:0; font-size:13px; color:#64748b;">
                  Reply directly to this email to respond to the buyer.
                </p>
                <p style="margin:12px 0 0 0; font-size:12px; color:#94a3b8;">
                  This enquiry was sent via OpenList. OpenList is a marketing platform and does not act as an estate agent.
                </p>
              </div>

            </div>
          </div>
        </div>
      `,
    })

    if ("error" in result && result.error) {
      return {
        success: false,
        error: `Resend failed: ${result.error.message}`,
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