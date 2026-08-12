import assert from "node:assert/strict"
import test from "node:test"
import {
  compactEircode,
  extractEircode,
  isValidEircode,
  looksLikeEircode,
  normaliseEircode,
} from "../lib/eircode.mjs"

test("equivalent Eircode forms share one canonical representation", () => {
  for (const value of [
    "A65 F4E2",
    "A65F4E2",
    "a65 f4e2",
    "a65f4e2",
    "  A65 F4E2  ",
    "\tA65   F4E2\n",
  ]) {
    assert.equal(normaliseEircode(value), "A65 F4E2")
    assert.equal(compactEircode(value), "A65F4E2")
    assert.equal(isValidEircode(value), true)
  }
})

test("official Routing Key and character rules include Dublin 6W", () => {
  for (const value of ["D01 F5P2", "D6W F2H3", "Y35 X2P1", "W91 X7YR"]) {
    assert.equal(isValidEircode(value), true, value)
  }

  for (const value of [
    "B12 F4E2",
    "D6X F2H3",
    "A65 O4E2",
    "A65 B4E2",
    "A65 I4E2",
    "A65F4E",
    "A65F4E22",
  ]) {
    assert.equal(isValidEircode(value), false, value)
    assert.equal(normaliseEircode(value), null, value)
  }
})

test("extraction finds genuine Eircodes without treating surrounding text as a code", () => {
  assert.equal(extractEircode("Main Street, Dublin, D02X285"), "D02 X285")
  assert.equal(extractEircode("Site at D6W F2H3, Dublin"), "D6W F2H3")

  for (const value of [
    "26/1638",
    "12 Main Street",
    "ABCDEFG",
    "GREVISK",
    "No postcode",
    "A65 O4E2",
  ]) {
    assert.equal(extractEircode(value), null, value)
  }
})

test("code-shaped invalid input is distinguishable from an address or place", () => {
  assert.equal(looksLikeEircode("A65 F4E"), true)
  assert.equal(looksLikeEircode("A65 O4E2"), true)
  assert.equal(looksLikeEircode("ABCDEFG"), false)
  assert.equal(looksLikeEircode("12 Main Street"), false)
})
