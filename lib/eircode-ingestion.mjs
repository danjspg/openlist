import { extractEircode, normaliseEircode } from "./eircode.mjs"

/** @param {unknown} value */
export function pprEircodeFields(value) {
  const eircode = normaliseEircode(value)
  return {
    eircode,
    eircode_prefix: eircode ? eircode.slice(0, 3) : null,
  }
}

/** @param {...unknown} values */
export function planningEircodeFromSources(...values) {
  for (const value of values) {
    const exact = normaliseEircode(value)
    if (exact) return exact

    const extracted = extractEircode(value)
    if (extracted) return extracted
  }

  return null
}

/** @param {...unknown} values */
export function planningEircodeFieldsFromSources(...values) {
  const eircode = planningEircodeFromSources(...values)
  return {
    eircode,
    eircode_prefix: eircode ? eircode.slice(0, 3) : null,
  }
}
