"use server"

import OpenAI from "openai"

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

type GenerateListingCopyInput = {
  type: string
  subtype: string
  saleMethod: string
  county: string
  addressLine2: string
  price: string
  beds?: number
  baths?: number
  areaValue?: number
  areaUnit?: string
  viewing?: string
  features?: string
}

export async function generateListingCopy(input: GenerateListingCopyInput): Promise<{
  excerpt: string
  description: string
  bullets: string[]
}> {
  const type = input.type.trim()
  const subtype = input.subtype.trim()
  const county = input.county.trim()
  const addressLine2 = input.addressLine2.trim()
  const price = input.price.trim()
  const viewing = input.viewing?.trim() || ""
  const features = input.features?.trim() || ""
  const saleMethod = input.saleMethod?.trim() || "Private Sale"

  if (!type || !county) {
    throw new Error("Property type and county are required to generate copy.")
  }

  const isSite = type === "Site"
  const isApartment = type === "Apartment"
  const isHouse = type === "House"

  const propertyInstructions = isSite
    ? `
Write this as a premium Irish site / land listing.
Focus on setting, outlook, scale, privacy, access and custom-build or development appeal.
Do not describe accommodation or internal layout.
`
    : isApartment
      ? `
Write this as a premium Irish apartment listing.
Focus on presentation, light, layout, practicality and ease of living.
Do not invent amenities such as parking, balconies, concierge or transport links.
`
      : isHouse
        ? `
Write this as a premium Irish house listing.
Focus on proportions, light, setting, presentation and practical appeal.
Do not invent extra rooms, sea views, gardens or extensions.
`
        : `
Write this as a premium Irish property listing with restrained and credible language.
Do not invent facts.
`

  const prompt = `
You are writing property marketing copy for OpenList, a modern Irish property platform.

Tone:
- calm
- premium
- restrained
- factual
- elegant but not flashy
- Irish / UK spelling

Avoid estate-agent clichés such as:
- stunning
- must-see
- rare opportunity
- dream home
- sure to impress
- luxurious throughout
- unbeatable

Property details:
- Type: ${type}
- Subtype: ${subtype || "n/a"}
- Sale method: ${saleMethod}
- County: ${county}
- Local area: ${addressLine2 || "n/a"}
- Price: ${price || "n/a"}
- Beds: ${input.beds || "n/a"}
- Baths: ${input.baths || "n/a"}
- Area: ${input.areaValue || "n/a"} ${input.areaUnit || ""}
- Viewing: ${viewing || "n/a"}
- Seller notes / features: ${features || "n/a"}

Instructions:
${propertyInstructions}

Return valid JSON only in this exact shape:
{
  "excerpt": "...",
  "description": "...",
  "bullets": ["...", "...", "...", "...", "...", "...", "...", "..."]
}

Rules:
- Excerpt: one sentence, 16 to 28 words
- Description: around 120 to 170 words
- Bullets: exactly 8
- Bullets must be short, factual and scannable, ideally 2 to 5 words
- No invented facts
- No markdown
`

  const response = await client.responses.create({
    model: "gpt-4.1-mini",
    input: prompt,
  })

  const text = response.output_text?.trim()

  if (!text) {
    throw new Error("AI did not return any text.")
  }

  try {
    const parsed = JSON.parse(text)

    const bullets = Array.isArray(parsed.bullets)
      ? parsed.bullets.map((item: unknown) => String(item).trim()).filter(Boolean).slice(0, 8)
      : []

    return {
      excerpt: String(parsed.excerpt ?? "").trim(),
      description: String(parsed.description ?? "").trim(),
      bullets,
    }
  } catch {
    throw new Error("AI returned an unexpected format.")
  }
}