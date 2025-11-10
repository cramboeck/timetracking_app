/**
 * Database transformation utilities
 * Converts snake_case database columns to camelCase for API responses
 * Also converts PostgreSQL DECIMAL/NUMERIC strings to Numbers
 */

// Convert snake_case to camelCase
function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

// Convert value types: PostgreSQL DECIMAL/NUMERIC comes as strings, convert to numbers
function transformValue(value: any): any {
  // If it's a string that looks like a number (including decimals), convert it
  if (typeof value === 'string' && /^-?\d+\.?\d*$/.test(value)) {
    const num = parseFloat(value);
    // Only convert if it's a valid number
    if (!isNaN(num)) {
      return num;
    }
  }
  return value;
}

// Transform a single database row from snake_case to camelCase
export function transformRow<T = any>(row: any): T {
  if (!row) return row;

  const transformed: any = {};

  for (const key in row) {
    if (row.hasOwnProperty(key)) {
      const camelKey = snakeToCamel(key);
      transformed[camelKey] = transformValue(row[key]);
    }
  }

  return transformed as T;
}

// Transform an array of database rows from snake_case to camelCase
export function transformRows<T = any>(rows: any[]): T[] {
  if (!rows || !Array.isArray(rows)) return rows;
  return rows.map(row => transformRow<T>(row));
}
