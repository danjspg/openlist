"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { getServerSupabase } from "@/lib/supabase"
import { requireSellerUser } from "@/lib/seller-auth"
import { sendViewingCancellationEmails, sendViewingConfirmationEmails } from "@/lib/viewing-emails"
import {
  formatEircode,
  isValidEircode,
  parseDublinViewingDateTime,
  type ViewingRow,
} from "@/lib/viewings"

function getRequired(formData: FormData, field: string, label: string) {
  const value = String(formData.get(field) ?? "").trim()
  if (!value) throw new Error(`${label} is required.`)
  return value
}

function normaliseEmail(value: string) {
  return value.trim().toLowerCase()
}

function isChecked(formData: FormData, field: string) {
  return formData.get(field) === "on"
}

export async function createViewing(formData: FormData) {
  const currentUser = await requireSellerUser()

  const viewerName = getRequired(formData, "viewerName", "Viewer name")
  const viewerEmail = normaliseEmail(getRequired(formData, "viewerEmail", "Viewer email"))
  const viewerPhone = String(formData.get("viewerPhone") ?? "").trim()
  const contactName = getRequired(formData, "contactName", "Seller contact name")
  const contactEmail = normaliseEmail(getRequired(formData, "contactEmail", "Seller contact email"))
  const contactPhone = String(formData.get("contactPhone") ?? "").trim()
  const propertyAddress = String(formData.get("propertyAddress") ?? "").trim()
  const propertyEircode = formatEircode(String(formData.get("propertyEircode") ?? ""))

  if (propertyEircode && !isValidEircode(propertyEircode)) {
    throw new Error("Please enter a valid Eircode, for example A65 F4E2.")
  }

  const propertyLocation =
    [propertyAddress, propertyEircode].filter(Boolean).join("\n") ||
    getRequired(formData, "propertyLocation", "Property location")
  const viewingDate = getRequired(formData, "viewingDate", "Viewing date")
  const viewingTime = getRequired(formData, "viewingTime", "Viewing time")
  const notes = String(formData.get("notes") ?? "").trim()
  const sendConfirmationToViewer = isChecked(formData, "sendConfirmationToViewer")
  const sendConfirmationToSeller = isChecked(formData, "sendConfirmationToSeller")
  const sendReminderToViewer = isChecked(formData, "sendReminderToViewer")
  const sendReminderToSeller = isChecked(formData, "sendReminderToSeller")
  const startsAt = parseDublinViewingDateTime(viewingDate, viewingTime)

  if (startsAt.getTime() < Date.now() - 5 * 60 * 1000) {
    throw new Error("Viewing time must be in the future.")
  }

  const supabase = getServerSupabase()
  const { data, error } = await supabase
    .from("viewings")
    .insert({
      owner_user_id: currentUser.id,
      viewer_name: viewerName,
      viewer_email: viewerEmail,
      viewer_phone: viewerPhone || null,
      contact_name: contactName,
      contact_email: contactEmail,
      contact_phone: contactPhone || null,
      property_location: propertyLocation,
      viewing_starts_at: startsAt.toISOString(),
      notes: notes || null,
      send_confirmation_to_viewer: sendConfirmationToViewer,
      send_confirmation_to_seller: sendConfirmationToSeller,
      send_reminder_to_viewer: sendReminderToViewer,
      send_reminder_to_seller: sendReminderToSeller,
      status: "scheduled",
    })
    .select("*")
    .single()

  if (error) {
    throw new Error(error.message)
  }

  await sendViewingConfirmationEmails(data as ViewingRow)

  revalidatePath("/my-viewings")
  redirect("/my-viewings?created=1")
}

export async function cancelViewing(formData: FormData) {
  const currentUser = await requireSellerUser()
  const id = getRequired(formData, "id", "Viewing ID")
  const supabase = getServerSupabase()

  const { data: existing, error: existingError } = await supabase
    .from("viewings")
    .select("*")
    .eq("id", id)
    .eq("owner_user_id", currentUser.id)
    .single()

  if (existingError) {
    throw new Error(existingError.message)
  }

  if ((existing as ViewingRow).status === "cancelled") {
    redirect(`/my-viewings/${id}?cancelled=1`)
  }

  const { data, error } = await supabase
    .from("viewings")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("owner_user_id", currentUser.id)
    .select("*")
    .single()

  if (error) {
    throw new Error(error.message)
  }

  await sendViewingCancellationEmails(data as ViewingRow)

  revalidatePath("/my-viewings")
  revalidatePath(`/my-viewings/${id}`)
  redirect(`/my-viewings/${id}?cancelled=1`)
}
