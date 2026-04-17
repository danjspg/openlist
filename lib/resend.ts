import { Resend } from "resend"

export function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY

  if (!apiKey) {
    throw new Error('Missing API key. Pass it to the constructor `new Resend("re_123")`')
  }

  return new Resend(apiKey)
}