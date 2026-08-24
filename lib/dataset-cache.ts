export const PLANNING_DATASET_CACHE_TAG = "planning-dataset"
export const PPR_DATASET_CACHE_TAG = "ppr-dataset"

export type DatasetCacheTarget = "planning" | "ppr"

export function isDatasetCacheTarget(value: string | null): value is DatasetCacheTarget {
  return value === "planning" || value === "ppr"
}
