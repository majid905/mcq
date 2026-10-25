'use client';

import type { components } from '@mcq/api-client-ts';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useApi } from '@/components/providers';
import { ApiError, unwrap } from '@/lib/api';

export type ExamDetail = components['schemas']['ExamDetail'];
export type AttemptResult = components['schemas']['AttemptResult'];
export type SolutionItem = components['schemas']['SolutionItem'];
export type LeaderboardRow = components['schemas']['LeaderboardRow'];
export type AttemptSummary = components['schemas']['AttemptSummary'];
export type ExamListStatus = 'upcoming' | 'running' | 'finished';
export type SolutionFilter = 'all' | 'wrong' | 'skipped' | 'correct';
export type AttemptKind = components['schemas']['AttemptKind'];

export const examKeys = {
  list: (status: ExamListStatus, category: string | null) => ['exams', status, category] as const,
  detail: (id: string) => ['exam', id] as const,
  result: (attemptId: string) => ['result', attemptId] as const,
  solutions: (attemptId: string, filter: SolutionFilter) =>
    ['solutions', attemptId, filter] as const,
  leaderboard: (examId: string, scope: 'overall' | 'district') =>
    ['leaderboard', examId, scope] as const,
  history: (kind: AttemptKind | null) => ['history', kind] as const,
};

export function useExamList(status: ExamListStatus, category: string | null) {
  const api = useApi();
  return useInfiniteQuery({
    queryKey: examKeys.list(status, category),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const { data, error, response } = await api.GET('/exams', {
        params: {
          query: {
            status,
            limit: 20,
            ...(category ? { category_id: category } : {}),
            ...(pageParam ? { cursor: pageParam } : {}),
          },
        },
      });
      if (!response.ok || !data) await unwrap(Promise.resolve({ data, error, response }));
      return {
        items: data?.data ?? [],
        next: data?.meta?.has_more ? (data.meta.next_cursor ?? undefined) : undefined,
      };
    },
    getNextPageParam: (last) => last.next,
  });
}

export function useExamDetail(id: string) {
  const api = useApi();
  return useQuery({
    queryKey: examKeys.detail(id),
    queryFn: () => unwrap(api.GET('/exams/{id}', { params: { path: { id } } })),
  });
}

/** 202 while scoring: keeps polling every 3 s for up to 60 s (FR-RES-01). */
export function useAttemptResult(attemptId: string) {
  const api = useApi();
  return useQuery({
    queryKey: examKeys.result(attemptId),
    queryFn: async (): Promise<AttemptResult | null> => {
      const { data, error, response } = await api.GET('/attempts/{id}/result', {
        params: { path: { id: attemptId } },
      });
      if (response.status === 202) return null;
      return unwrap(Promise.resolve({ data, error, response }));
    },
    refetchInterval: (q) => {
      if (q.state.data !== null) return false;
      const elapsed = Date.now() - (q.state.dataUpdatedAt || Date.now());
      return q.state.dataUpdateCount < 20 && elapsed < 60_000 ? 3_000 : false;
    },
    retry: (count, e) => count < 2 && !(e instanceof ApiError && e.status < 500 && e.status !== 0),
  });
}

export function useSolutions(attemptId: string, filter: SolutionFilter) {
  const api = useApi();
  return useQuery({
    queryKey: examKeys.solutions(attemptId, filter),
    queryFn: () =>
      unwrap(
        api.GET('/attempts/{id}/solutions', {
          params: { path: { id: attemptId }, query: { filter } },
        }),
      ),
  });
}

export function useLeaderboard(examId: string, scope: 'overall' | 'district') {
  const api = useApi();
  return useQuery({
    queryKey: examKeys.leaderboard(examId, scope),
    queryFn: () =>
      unwrap(
        api.GET('/exams/{id}/leaderboard', { params: { path: { id: examId }, query: { scope } } }),
      ),
  });
}

export function useHistory(kind: AttemptKind | null) {
  const api = useApi();
  return useInfiniteQuery({
    queryKey: examKeys.history(kind),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const { data, error, response } = await api.GET('/me/attempts', {
        params: {
          query: {
            limit: 20,
            ...(kind ? { kind } : {}),
            ...(pageParam ? { cursor: pageParam } : {}),
          },
        },
      });
      if (!response.ok || !data) await unwrap(Promise.resolve({ data, error, response }));
      return {
        items: data?.data ?? [],
        next: data?.meta?.has_more ? (data.meta.next_cursor ?? undefined) : undefined,
      };
    },
    getNextPageParam: (last) => last.next,
  });
}
