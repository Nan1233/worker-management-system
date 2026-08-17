/**
 * Legacy compatibility helper for clients that still consume paged manager data.
 * The main UI uses explicit server pagination from productionService.ts.
 */
export const MANAGER_FETCH_PAGE_SIZE = 100;
export const MAX_MANAGER_FETCH_PAGES = 50;

export type ManagerPageLoader<T> = (page: number, pageSize: number) => Promise<T[]>;

export async function loadBoundedManagerPages<T>(
  loader: ManagerPageLoader<T>,
  maxPages: number = MAX_MANAGER_FETCH_PAGES,
): Promise<T[]> {
  const safePages = Math.min(MAX_MANAGER_FETCH_PAGES, Math.max(1, Math.trunc(maxPages)));
  const result: T[] = [];
  for (let page = 1; page <= safePages; page += 1) {
    const items = await loader(page, MANAGER_FETCH_PAGE_SIZE);
    result.push(...items);
    if (items.length < MANAGER_FETCH_PAGE_SIZE) break;
  }
  return result;
}
