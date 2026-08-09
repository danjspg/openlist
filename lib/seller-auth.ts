// Historical compatibility module. Active code imports neutral account helpers
// from lib/auth; this re-export avoids breaking old snapshots or integrations.
export * from "@/lib/auth"
