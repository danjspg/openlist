"use server"

import { supabase } from "@/lib/supabase"
import { getResendClient } from "@/lib/resend"

export async function submitEnquiry(formData: FormData) {
  const listingSlug = String(formData.get("listingSlug") ?? "").trim()
  const listingTitle = String(formData.get("listingTitle") ?? "").trim()
  const name = String(formData.get("name") ?? "").trim()
  const email = String(formData.get("email") ?? "").trim()
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

  const enquiryFrom = process.env.ENQUIRY_FROM_EMAIL
  const resendApiKey = process.env.RESEND_API_KEY

  if (!resendApiKey) {
    return {
      success: false,
      error: "Missing RESEND_API_KEY in .env.local",
    }
  }

  if (!enquiryFrom) {
    return {
      success: false,
      error: "Missing ENQUIRY_FROM_EMAIL in .env.local",
    }
  }

  try {
    const resend = getResendClient()

    const result = await resend.emails.send({
      from: enquiryFrom,
      to: [listing.seller_email],
      subject: `New enquiry: ${listingTitle}`,
      replyTo: email,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a;">
          <h2 style="margin-bottom: 16px;">New OpenList enquiry</h2>

          <p><strong>Property:</strong> ${listingTitle}</p>

          <hr style="margin: 24px 0; border: none; border-top: 1px solid #e2e8f0;" />

          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Phone:</strong> ${phone || "Not provided"}</p>

          <p><strong>Message:</strong></p>
          <div style="padding: 12px 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; white-space: pre-wrap;">
${message}
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