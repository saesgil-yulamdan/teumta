import { create } from 'axios';

import { API_BASE_URL } from '@/constants/config';

export const apiClient = create({
  baseURL: `${API_BASE_URL}/api`,
  timeout: 10000,
});
