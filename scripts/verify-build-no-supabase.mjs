import { spawn } from "node:child_process"

const marker = "OPENLIST_SUPABASE_READ_DURING_BUILD"
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "build"], {
  env: {
    ...process.env,
    OPENLIST_AUDIT_SUPABASE_BUILD_READS: "1",
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || "https://build-audit.invalid",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "build-audit-anon-key-placeholder-000000000000",
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || "build-audit-service-key-placeholder-0000000000",
  },
  stdio: ["ignore", "pipe", "pipe"],
})

let output = ""
for (const stream of [child.stdout, child.stderr]) {
  stream.setEncoding("utf8")
  stream.on("data", (chunk) => {
    output += chunk
    process.stdout.write(chunk)
  })
}

const exitCode = await new Promise((resolve) => child.once("exit", resolve))
if (output.includes(marker)) {
  console.error("next build attempted to read Supabase")
  process.exit(1)
}
if (exitCode !== 0) process.exit(Number(exitCode || 1))
console.log("Verified: next build performed zero Supabase reads.")
