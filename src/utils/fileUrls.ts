import { getApiBaseUrl } from '../services/api';

export const getAbsoluteFileUrl = (fileUrl: string): string => {
  if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) {
    return fileUrl;
  }
  const apiBase = getApiBaseUrl();
  const relativePath = fileUrl.startsWith('/api') ? fileUrl.substring(4) : fileUrl;
  return `${apiBase}${relativePath}`;
};
