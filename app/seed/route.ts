import { supabase } from "@/lib/supabase"

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
}

const counties = [
  "Cork",
  "Dublin",
  "Galway",
  "Kerry",
  "Clare",
  "Limerick",
  "Wexford",
  "Waterford",
  "Mayo",
  "Donegal",
  "Wicklow",
  "Kildare",
  "Meath",
  "Kilkenny",
  "Westmeath",
]

const houseTitles = [
  "Detached Home",
  "Semi-Detached House",
  "Family Home",
  "Redbrick Residence",
  "Modern Detached House",
  "Contemporary Home",
  "Period House",
  "Countryside Residence",
  "Village House",
  "Coastal Home",
]

const apartmentTitles = [
  "City Apartment",
  "Harbour Apartment",
  "Parkside Apartment",
  "Two-Bed Apartment",
  "Penthouse Apartment",
  "Modern Apartment",
  "Riverside Apartment",
  "Town Centre Apartment",
]

const siteTitles = [
  "Residential Site",
  "Coastal Site",
  "Elevated Site",
  "Development Site",
  "Scenic Plot",
  "Building Site",
  "Roadside Site",
]

const placeNames = [
  "Blackrock",
  "Clontarf",
  "Douglas",
  "Salthill",
  "Malahide",
  "Greystones",
  "Carrigaline",
  "Kinsale",
  "Dingle",
  "Westport",
  "Dalkey",
  "Howth",
  "Ennis",
  "Naas",
  "Ashford",
  "Midleton",
  "Skibbereen",
  "Tramore",
  "Letterkenny",
  "Oranmore",
]

const viewingOptions = [
  "By appointment",
  "Viewing by appointment",
  "Private appointments available",
]

const sitePlanningOptions = [null, "Planning approved", "Subject to planning"]

const houseImages = [
  "https://images.unsplash.com/photo-1568605114967-8130f3a36994?auto=format&fit=crop&crop=entropy&w=1600&h=1067&q=80",
  "https://images.unsplash.com/photo-1570129477492-45c003edd2be?auto=format&fit=crop&crop=entropy&w=1600&h=1067&q=80",
  "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&crop=entropy&w=1600&h=1067&q=80",
  "https://images.unsplash.com/photo-1600585154526-990dced4db0d?auto=format&fit=crop&crop=entropy&w=1600&h=1067&q=80",
  "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&crop=entropy&w=1600&h=1067&q=80",
  "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&crop=entropy&w=1600&h=1067&q=80",
  "https://images.unsplash.com/photo-1599423300746-b62533397364?auto=format&fit=crop&crop=entropy&w=1600&h=1067&q=80",
  "https://images.unsplash.com/photo-1582268611958-ebfd161ef9cf?auto=format&fit=crop&crop=entropy&w=1600&h=1067&q=80",
]

const apartmentImages = [
  "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&crop=entropy&w=1600&h=1067&q=80",
  "https://images.unsplash.com/photo-1494526585095-c41746248156?auto=format&fit=crop&crop=entropy&w=1600&h=1067&q=80",
  "https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&crop=entropy&w=1600&h=1067&q=80",
  "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&crop=entropy&w=1600&h=1067&q=80",
  "https://images.unsplash.com/photo-1502005229762-cf1b2da7c5d6?auto=format&fit=crop&crop=entropy&w=1600&h=1067&q=80",
  "https://images.unsplash.com/photo-1460317442991-0ec209397118?auto=format&fit=crop&crop=entropy&w=1600&h=1067&q=80",
]

const siteImages = [
  "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&crop=entropy&w=1600&h=1067&q=80",
  "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&crop=entropy&w=1600&h=1067&q=80",
  "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&crop=entropy&w=1600&h=1067&q=80",
  "https://images.unsplash.com/photo-1470770903676-69b98201ea1c?auto=format&fit=crop&crop=entropy&w=1600&h=1067&q=80",
  "https://images.unsplash.com/photo-1465146344425-f00d5f5c8f07?auto=format&fit=crop&crop=entropy&w=1600&h=1067&q=80",
  "https://images.unsplash.com/photo-1500375592092-40eb2168fd21?auto=format&fit=crop&crop=entropy&w=1600&h=1067&q=80",
]

function random<T>(arr: T[]) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function formatEuro(value: number) {
  return `€${value.toLocaleString("en-IE")}`
}

function rotateImages(pool: string[], seed: number, count = 4) {
  const images: string[] = []

  for (let i = 0; i < count; i++) {
    images.push(pool[(seed + i) % pool.length])
  }

  return images
}

function pickImages(type: "House" | "Apartment" | "Site", index: number) {
  if (type === "House") return rotateImages(houseImages, index, 4)
  if (type === "Apartment") return rotateImages(apartmentImages, index, 4)
  return rotateImages(siteImages, index, 4)
}

export async function GET() {
  const listings = []

  for (let i = 1; i <= 100; i++) {
    const county = random(counties)
    const place = random(placeNames)

    let type: "House" | "Apartment" | "Site"
    if (i % 5 === 0) {
      type = "Site"
    } else if (i % 3 === 0) {
      type = "Apartment"
    } else {
      type = "House"
    }

    const status =
      type === "Site"
        ? random(["For Sale", "For Sale", "Sale Agreed"])
        : random(["For Sale", "For Sale", "For Sale", "Sale Agreed"])

    let title = ""
    let price = ""
    let beds = 0
    let baths = 0
    let sqft = 0
    let images: string[] = []
    let excerpt = ""
    let description = ""
    let planning: string | null = null

    if (type === "House") {
      title = `${random(houseTitles)}, ${place}`
      beds = randomInt(3, 5)
      baths = randomInt(2, 4)
      sqft = randomInt(1200, 2800)
      price = formatEuro(randomInt(325, 895) * 1000)
      images = pickImages(type, i)
      excerpt = `${beds}-bed ${status.toLowerCase()} home in ${place}, Co. ${county}.`
      description = `A well-presented ${beds}-bedroom home in ${place}, Co. ${county}, offering bright accommodation, generous proportions, and a strong sense of privacy. Ideal as a family home, the property combines practical layout with a clean, modern presentation.`
    }

    if (type === "Apartment") {
      title = `${random(apartmentTitles)}, ${place}`
      beds = randomInt(1, 3)
      baths = randomInt(1, 2)
      sqft = randomInt(550, 1200)
      price = formatEuro(randomInt(210, 575) * 1000)
      images = pickImages(type, i)
      excerpt = `${beds}-bed apartment in ${place}, Co. ${county}, presented in a bright modern style.`
      description = `A smartly presented apartment in ${place}, Co. ${county}, with bright interiors and a convenient layout suited to modern living. The property offers a calm, low-maintenance finish and would appeal to both owner-occupiers and investors.`
    }

    if (type === "Site") {
      title = `${random(siteTitles)}, ${place}`
      sqft = randomInt(900, 3500)
      price = formatEuro(randomInt(140, 480) * 1000)
      images = pickImages(type, i)
      planning = random(sitePlanningOptions)
      excerpt = `Residential site in ${place}, Co. ${county}, with strong potential in an attractive setting.`
      description = `A well-located site in ${place}, Co. ${county}, offering an opportunity to create a distinctive home in a sought-after setting. The plot enjoys a strong position and would suit buyers seeking a custom-build or long-term development potential.`
    }

    const slug = slugify(`${title}-${county}-${i}`)

    listings.push({
      slug,
      seller_email: "dannyspillane@gmail.com",
      title,
      county,
      price,
      beds,
      baths,
      sqft,
      image: images[0],
      images,
      excerpt,
      description,
      status,
      type,
      planning,
      viewing: random(viewingOptions),
    })
  }

  const { error } = await supabase.from("listings").insert(listings)

  if (error) {
    return Response.json(
      { success: false, error: error.message },
      {
        headers: {
          "X-Robots-Tag": "noindex, nofollow",
        },
      }
    )
  }

  return Response.json(
    { success: true, inserted: listings.length },
    {
      headers: {
        "X-Robots-Tag": "noindex, nofollow",
      },
    }
  )
}
