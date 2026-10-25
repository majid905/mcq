'use client';

import type { components } from '@mcq/api-client-ts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '@/components/providers';
import { unwrap } from './api';

export type Me = components['schemas']['Me'];
export type MeUpdate = components['schemas']['MeUpdate'];
export type HomeFeed = components['schemas']['HomeFeed'];
export type ExamCard = components['schemas']['ExamCard'];
export type TaxonomyNode = components['schemas']['TaxonomyNode'];
export type PublicSettings = components['schemas']['PublicSettings'];

export const queryKeys = {
  me: ['me'] as const,
  home: ['home'] as const,
  settings: ['settings', 'public'] as const,
  categories: ['taxonomy', 'root'] as const,
};

export function useMe() {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.me, queryFn: () => unwrap(api.GET('/me')) });
}

export function useUpdateMe() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: MeUpdate) => unwrap(api.PATCH('/me', { body })),
    onSuccess: (me) => qc.setQueryData(queryKeys.me, me),
  });
}

export function useHome() {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.home, queryFn: () => unwrap(api.GET('/home')) });
}

export function usePublicSettings(pollMs?: number) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.settings,
    queryFn: () => unwrap(api.GET('/settings/public')),
    staleTime: pollMs ?? 5 * 60_000,
    refetchInterval: pollMs,
  });
}

export function useCategories() {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.categories,
    queryFn: () => unwrap(api.GET('/taxonomy')),
    staleTime: 10 * 60_000,
  });
}
