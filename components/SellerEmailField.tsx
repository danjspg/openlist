"use client"

import { useEffect, useState } from "react"

type Props = {
  id?: string
  name?: string
  label?: string
  defaultValue?: string
  placeholder?: string
  required?: boolean
  helperText?: string
  className?: string
}

const STORAGE_KEY = "openlist_seller_email"

export default function SellerEmailField({
  id = "sellerEmail",
  name = "email",
  label = "Seller email",
  defaultValue = "",
  placeholder = "you@example.com",
  required = false,
  helperText,
  className = "h-12 w-full rounded-full border border-slate-300 bg-white px-4 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-500",
}: Props) {
  const [value, setValue] = useState(defaultValue)

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY)

    if ((!defaultValue || defaultValue.trim() === "") && saved) {
      setValue(saved)
    }
  }, [defaultValue])

  function handleChange(nextValue: string) {
    setValue(nextValue)
    window.localStorage.setItem(STORAGE_KEY, nextValue)
  }

  return (
    <div>
      <label
        htmlFor={id}
        className="mb-2 block text-sm font-medium text-slate-700"
      >
        {label}
      </label>

      <input
        id={id}
        name={name}
        type="email"
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(e) => handleChange(e.target.value)}
        className={className}
      />

      {helperText && (
        <p className="mt-2 text-sm text-slate-500">{helperText}</p>
      )}
    </div>
  )
}