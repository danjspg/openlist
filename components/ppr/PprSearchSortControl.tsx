"use client"

type Props = {
  params: Record<string, string | undefined>
}

export default function PprSearchSortControl({ params }: Props) {
  return (
    <form action="/sold-prices/search" className="flex items-center gap-3">
      {Object.entries(params).map(([key, value]) => {
        if (!value || key === "sort" || key === "page") return null
        return <input key={key} type="hidden" name={key} value={value} />
      })}
      <label className="text-sm font-medium text-stone-600" htmlFor="sold-price-sort">
        Sort by
      </label>
      <select
        id="sold-price-sort"
        name="sort"
        defaultValue={params.sort || "newest"}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className="h-11 rounded-full border border-stone-300 bg-white px-4 text-sm text-stone-900 outline-none transition focus:border-stone-500"
      >
        <option value="newest">Newest first</option>
        <option value="oldest">Oldest first</option>
        <option value="price-high">Price high to low</option>
        <option value="price-low">Price low to high</option>
      </select>
    </form>
  )
}
