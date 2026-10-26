'use client';

import type { components } from '@mcq/api-client-ts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '@/components/providers';
import { expectOk, unwrap } from './api';

export type AdminProfile = components['schemas']['AdminProfile'];
export type AdminDashboard = components['schemas']['AdminDashboard'];

export const adminKeys = {
  me: ['admin', 'me'] as const,
  dashboard: ['admin', 'dashboard'] as const,
};

export function useAdminMe() {
  const api = useApi();
  return useQuery({
    queryKey: adminKeys.me,
    queryFn: () => unwrap(api.GET('/admin/me')),
    staleTime: 5 * 60_000,
  });
}

export function useDashboard() {
  const api = useApi();
  return useQuery({
    queryKey: adminKeys.dashboard,
    queryFn: () => unwrap(api.GET('/admin/dashboard')),
    refetchInterval: 60_000,
  });
}

export function useAdminLogout() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    // The BFF puts the refresh token in the body and clears the cookies either way.
    mutationFn: () =>
      expectOk(api.POST('/admin/auth/logout', { body: { refresh_token: 'bff' } })).catch(
        () => undefined,
      ),
    onSettled: () => {
      qc.clear();
      window.location.assign('/login');
    },
  });
}
