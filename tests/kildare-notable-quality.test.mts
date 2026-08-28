import assert from "node:assert/strict"
import test from "node:test"
import { htmlText, parseKildareEplan, valueAfterLabel } from "../scripts/repair-kildare-notable-quality.mts"

test("extracts Kildare ePlan description and decision", () => {
  const html = `
    <table>
      <tr><td>Development Description:</td><td>Permission for a large commercial development with associated site works.</td></tr>
      <tr><td>Decision Type:</td><td>Conditional</td></tr>
    </table>`
  assert.equal(valueAfterLabel(html, ["Development Description"]), "Permission for a large commercial development with associated site works.")
  assert.deepEqual(parseKildareEplan(html), {
    proposal: "Permission for a large commercial development with associated site works.",
    status: "Conditional",
  })
})

test("falls back to application status when no decision exists", () => {
  const html = `<table><tr><td>Development Description</td><td>Warehouse extension</td></tr><tr><td>Application Status</td><td>Further Information</td></tr></table>`
  assert.deepEqual(parseKildareEplan(html), { proposal: "Warehouse extension", status: "Further Information" })
})

test("does not treat search landing page as an application", () => {
  const html = `<html><body><h2>Select Search Type</h2><p>Find a planning application search</p></body></html>`
  assert.equal(parseKildareEplan(html), null)
  assert.equal(htmlText("<b>A</b>&nbsp; B"), "A B")
})
