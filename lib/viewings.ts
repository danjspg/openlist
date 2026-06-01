export type ViewingStatus = "scheduled" | "cancelled" | "completed"

export type ViewingRow = {
  id: string
  created_at: string
  updated_at?: string | null
  owner_user_id: string
  listing_id?: string | null
  listing_title?: string | null
  listing_url?: string | null
  listing_image?: string | null
  viewer_name: string
  viewer_email: string
  viewer_phone?: string | null
  contact_name: string
  contact_email: string
  contact_phone?: string | null
  property_location: string
  viewing_starts_at: string
  notes?: string | null
  send_confirmation_to_viewer?: boolean | null
  send_confirmation_to_seller?: boolean | null
  send_reminder_to_viewer?: boolean | null
  send_reminder_to_seller?: boolean | null
  status: ViewingStatus
  reminder_sent_at?: string | null
  cancelled_at?: string | null
}

const EIRCODE_PATTERN = /\b([A-Z0-9]{3}\s?[A-Z0-9]{4})\b/i

export function formatEircode(value: string) {
  const compact = value.trim().replace(/\s+/g, "").toUpperCase()
  if (!compact) return ""
  if (compact.length !== 7) return value.trim().toUpperCase()
  return `${compact.slice(0, 3)} ${compact.slice(3)}`
}

export function isValidEircode(value: string) {
  if (!value.trim()) return true
  return EIRCODE_PATTERN.test(formatEircode(value))
}

export function extractEircode(value: string) {
  const match = value.match(EIRCODE_PATTERN)
  return match ? formatEircode(match[1]) : ""
}

export function splitPropertyLocation(value: string) {
  const eircode = extractEircode(value)
  const address = eircode
    ? value
        .replace(new RegExp(`\\b${eircode.replace(" ", "\\s?")}\\b`, "i"), "")
        .split("\n")
        .map((part) => part.trim())
        .filter(Boolean)
        .join("\n")
    : value.trim()

  return {
    address,
    eircode,
  }
}

export function getGoogleMapsUrl(location: string) {
  const eircode = extractEircode(location)
  const compactLocation = location
    .split("\n")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ")
  const query = eircode ? `${eircode}, Ireland` : `${compactLocation}, Ireland`

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

export function formatViewingDateTime(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value)

  if (Number.isNaN(date.getTime())) return "Date not set"

  return new Intl.DateTimeFormat("en-IE", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Dublin",
  }).format(date)
}

export function formatViewingTime(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value)

  if (Number.isNaN(date.getTime())) return "time not set"

  return new Intl.DateTimeFormat("en-IE", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Dublin",
  }).format(date)
}

export function formatDateInput(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value)

  if (Number.isNaN(date.getTime())) return ""

  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Europe/Dublin",
  }).format(date)
}

export function formatTimeInput(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value)

  if (Number.isNaN(date.getTime())) return ""

  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Dublin",
  }).format(date)
}

export async function getCurrentTimeMs() {
  return Date.now()
}

export async function getTomorrowDateInput() {
  return formatDateInput(new Date(Date.now() + 24 * 60 * 60 * 1000))
}

function getTimeZoneParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })

  const parts = formatter.formatToParts(date)
  const values = new Map(parts.map((part) => [part.type, part.value]))

  return {
    year: Number(values.get("year")),
    month: Number(values.get("month")),
    day: Number(values.get("day")),
    hour: Number(values.get("hour")),
    minute: Number(values.get("minute")),
    second: Number(values.get("second")),
  }
}

export function parseDublinViewingDateTime(dateValue: string, timeValue: string) {
  const [year, month, day] = dateValue.split("-").map(Number)
  const [hour, minute] = timeValue.split(":").map(Number)

  if (!year || !month || !day || Number.isNaN(hour) || Number.isNaN(minute)) {
    throw new Error("Please enter a valid viewing date and time.")
  }

  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0)
  const zoneParts = getTimeZoneParts(new Date(utcGuess), "Europe/Dublin")
  const zoneAsUtc = Date.UTC(
    zoneParts.year,
    zoneParts.month - 1,
    zoneParts.day,
    zoneParts.hour,
    zoneParts.minute,
    zoneParts.second
  )
  const offsetMs = zoneAsUtc - utcGuess
  const date = new Date(utcGuess - offsetMs)

  if (Number.isNaN(date.getTime())) {
    throw new Error("Please enter a valid viewing date and time.")
  }

  return date
}

export function getViewingStatusLabel(status: ViewingStatus) {
  if (status === "cancelled") return "Cancelled"
  if (status === "completed") return "Completed"
  return "Scheduled"
}
