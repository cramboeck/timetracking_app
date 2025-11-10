/**
 * Database transformation utilities
 * Converts snake_case database columns to camelCase for API responses
 */

// Convert snake_case to camelCase
function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

// Transform a single database row from snake_case to camelCase
export function transformRow<T = any>(row: any): T {
  if (!row) return row;

  const transformed: any = {};

  for (const key in row) {
    if (row.hasOwnProperty(key)) {
      const camelKey = snakeToCamel(key);
      transformed[camelKey] = row[key];
    }
  }

  return transformed as T;
}

// Transform an array of database rows from snake_case to camelCase
export function transformRows<T = any>(rows: any[]): T[] {
  if (!rows || !Array.isArray(rows)) return rows;
  return rows.map(row => transformRow<T>(row));
}
