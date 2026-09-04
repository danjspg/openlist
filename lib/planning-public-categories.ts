import { unstable_cache } from "next/cache"
import { PLANNING_DATASET_CACHE_TAG } from "@/lib/dataset-cache"
import type { PlanningApplication } from "@/lib/planning"
import { getPlanningAuthorityByCode } from "@/lib/planning-authorities"
import { getServerSupabase } from "@/lib/supabase"
import { PLANNING_PUBLIC_CATEGORY_PAGE_SIZE, planningPublicCategoryPageRequest } from "@/lib/planning-public-category-pagination"
import {
  PLANNING_PUBLIC_CATEGORIES,
  type PlanningPublicCategory,
} from "@/lib/planning-public-category-definitions"
export { PLANNING_PUBLIC_CATEGORY_MAX_PAGE, PLANNING_PUBLIC_CATEGORY_PAGE_SIZE, planningPublicCategoryPageNumber, planningPublicCategoryPageRequest } from "@/lib/planning-public-category-pagination"
export {
  PLANNING_PUBLIC_CATEGORIES,
  planningPublicCategorySummariesFromSource,
} from "@/lib/planning-public-category-definitions"
export type {
  PlanningPublicCategory,
  PlanningPublicCategorySourceRow,
} from "@/lib/planning-public-category-definitions"
export type PlanningPublicCategoryApplication={application:PlanningApplication;displayName:string|null;categories:string[]}
type Payload={rows?:PlanningPublicCategoryApplication[];totalCount?:number;overallTotalCount?:number;overallActiveCount?:number;activeCount?:number;authorityCounts?:Array<{code:string;count:number}>}
const loadCategoryPage=unstable_cache(async(slug:string,includeOlder:boolean,authorityCode:string|null,pageNumber:number,pageSize:number,activeOnly:boolean)=>{const{data,error}=await getServerSupabase().rpc("openlist_planning_public_category_page_active",{p_category:slug,p_include_older:includeOlder,p_authority_code:authorityCode,p_limit:pageSize,p_offset:(pageNumber-1)*pageSize,p_active_only:activeOnly});if(error)throw new Error(`Planning public category page lookup failed: ${error.message}`);return(data??{})as Payload},["planning-public-category-page","v5-active-authority-counts"],{revalidate:21600,tags:[PLANNING_DATASET_CACHE_TAG]})
export async function getPlanningPublicCategory(slug:string,includeOlder=false,authorityCode?:string|null,requestedPage=1,activeOnly=false){const category=PLANNING_PUBLIC_CATEGORIES.find(i=>i.slug===slug);if(!category)return null;const selectedAuthority=authorityCode?getPlanningAuthorityByCode(authorityCode):null;const{pageNumber,rpcParameters}=planningPublicCategoryPageRequest(slug,includeOlder,selectedAuthority?.code??null,requestedPage);const payload=await loadCategoryPage(String(rpcParameters.p_category),Boolean(rpcParameters.p_include_older),rpcParameters.p_authority_code,pageNumber,Number(rpcParameters.p_limit),activeOnly);const totalCount=Number(payload.totalCount)||0,overallTotalCount=Number(payload.overallTotalCount)||0,overallActiveCount=Number(payload.overallActiveCount)||0,activeCount=Number(payload.activeCount)||0,totalPages=Math.max(1,Math.ceil(totalCount/PLANNING_PUBLIC_CATEGORY_PAGE_SIZE));const authorities=(Array.isArray(payload.authorityCounts)?payload.authorityCounts:[]).map(({code,count})=>({authority:getPlanningAuthorityByCode(code),count:Number(count)||0})).filter(i=>i.authority).sort((a,b)=>b.count-a.count||String(a.authority?.shortName||"").localeCompare(String(b.authority?.shortName||"")));return{category,rows:Array.isArray(payload.rows)?payload.rows:[],totalCount,overallTotalCount,overallActiveCount,activeCount,authorities,includeOlder,activeOnly,selectedAuthority,pageNumber,pageSize:PLANNING_PUBLIC_CATEGORY_PAGE_SIZE,totalPages}}
export async function getPlanningPublicCategorySummaries(_minimumCount=3){void _minimumCount;return[]as Array<PlanningPublicCategory&{count:number}>}
