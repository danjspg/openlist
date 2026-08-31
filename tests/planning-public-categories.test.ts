import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import {
  PLANNING_PUBLIC_CATEGORY_PAGE_SIZE,
  planningPublicCategoryPageRequest,
} from "../lib/planning-public-category-pagination"

test("category pages use non-overlapping bounded windows", () => {
  const first = planningPublicCategoryPageRequest("padel", true, null, 1)
  const second = planningPublicCategoryPageRequest("padel", true, null, 2)
  assert.equal(first.rpcParameters.p_limit, 25)
  assert.equal(first.rpcParameters.p_offset, 0)
  assert.equal(second.rpcParameters.p_offset, PLANNING_PUBLIC_CATEGORY_PAGE_SIZE)

  const ids = Array.from({ length: 75 }, (_, index) => index)
  const pageOne = ids.slice(first.rpcParameters.p_offset, first.rpcParameters.p_offset + first.rpcParameters.p_limit)
  const pageTwo = ids.slice(second.rpcParameters.p_offset, second.rpcParameters.p_offset + second.rpcParameters.p_limit)
  assert.equal(pageOne.some((id) => pageTwo.includes(id)), false)
})

test("authority-filtered pagination sends one authority-scoped RPC", () => {
  const request = planningPublicCategoryPageRequest("solar-energy", false, "CORKCOCO", 2)
  assert.deepEqual(request.rpcParameters, {
    p_category: "solar-energy",
    p_include_older: false,
    p_authority_code: "CORKCOCO",
    p_limit: 25,
    p_offset: 25,
  })
})

test("the database page function uses exact membership and deterministic ordering", async () => {
  const sql = await readFile(
    new URL("../supabase/migrations/20260831200813_paginate_planning_public_category_corpus.sql", import.meta.url),
    "utf8"
  )
  assert.match(sql, /notable_categories\s+@>\s+array\[p_category\]/)
  assert.match(sql, /order by registration_date desc nulls last, reference desc, application_id/)
  assert.match(sql, /limit greatest\(1, least\(coalesce\(p_limit, 25\), 40\)\)/)
  assert.match(sql, /p_authority_code is null or local_authority_code = p_authority_code/)
  assert.doesNotMatch(sql, /ilike|similar to/)
})

test("normal locality views remain capped at three cards per category", async () => {
  const source = await readFile(new URL("../lib/planning-locality-notable.ts", import.meta.url), "utf8")
  assert.match(source, /groupPlanningLocalityNotables\(rows, includeOlder \? 8 : 6, includeOlder \? 6 : 3\)/)
  assert.match(source, /group\.applications\.slice\(0, maxApplicationsPerGroup\)/)
})
