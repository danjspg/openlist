"use server"

import OpenAI from "openai"

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

type GenerateListingCopyInput = {
  title: string
  county: string
  price: string
  type: string
  beds?: number
  baths?: number
  sqft?: number
  planning?: string
  viewing?: string
  features?: string
}

export async function generateListingCopy(
  input: GenerateListingCopyInput
): Promise<{ excerpt: string; description: string }> {
  const title = input.title.trim()
  const county = input.county.trim()
  const price = input.price.trim()
  const type = input.type.trim()
  const planning = input.planning?.trim() || ""
  const viewing = input.viewing?.trim() || ""
  const features = input.features?.trim() || ""

  if (!title || !county || !type) {
    throw new Error("Title, county and type are required to generate copy.")
  }

  const isSite = type.toLowerCase() === "site"
  const isApartment = type.toLowerCase() === "apartment"
  const isHouse = type.toLowerCase() === "house"

  const propertyInstructions = isSite
    ? `
Write this as a premium Irish site / land listing.
Focus on:
- setting
- planning status if provided
- privacy, outlook, access, and development potential
- custom-build appeal
- restrained, credible language

Do NOT describe internal accommodation, room flow, or family living unless explicitly provided.
Do NOT imply planning is granted unless the planning field says so.
`
    : isApartment
      ? `
Write this as a premium Irish apartment listing.
Focus on:
- presentation
- layout
- light
- practicality
- low-maintenance appeal
- convenience of setting

Do NOT invent amenities such as parking, balconies, concierge, or transport links unless clearly provided.
`
      : isHouse
        ? `
Write this as a premium Irish house listing.
Focus on:
- overall presentation
- proportions
- layout
- natural light
- privacy
- practical family appeal
- quality of setting

Do NOT invent extra rooms, extensions, gardens, or sea views unless clearly provided.
`
        : `
Write this as a premium Irish property listing with calm, restrained language.
Do not invent features.
`

  const prompt = `
You are writing listing copy for OpenList, a modern Irish property platform.

Tone and style:
- calm
- premium
- restrained
- credible
- elegant but not flashy
- no estate-agent clichés
- suitable for the Irish market

Avoid phrases like:
- stunning
- must-see
- rare opportunity
- dream home
- luxurious throughout
- sure to impress
- unbeatable

Property details:
- Title: ${title}
- County: ${county}
- Price: ${price || "n/a"}
- Type: ${type}
- Beds: ${input.beds || "n/a"}
- Baths: ${input.baths || "n/a"}
- Sq Ft / Site Area: ${input.sqft || "n/a"}
- Planning: ${planning || "n/a"}
- Viewing: ${viewing || "n/a"}
- Seller notes / key features: ${features || "n/a"}

Additional instructions:
${propertyInstructions}

Rules:
- Do not invent facts.
- Use Irish/UK spelling.
- Keep the copy feeling polished and trustworthy.
- Mention the county naturally.
- If useful, include the price naturally, but do not force it.
- The excerpt should be one sentence, around 16 to 28 words.
- The description should be around 120 to 170 words.
- Return valid JSON only, with no markdown fences.

Return exactly:
{
  "excerpt": "...",
  "description": "..."
}
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

    return {
      excerpt: String(parsed.excerpt ?? "").trim(),
      description: String(parsed.description ?? "").trim(),
    }
  } catch {
    throw new Error("AI returned an unexpected format.")
  }
}