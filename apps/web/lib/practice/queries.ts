'use client';

import type { components } from '@mcq/api-client-ts';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '@/components/providers';
import { expectOk, unwrap } from '@/lib/api';

export type Question = components['schemas']['Question'];
export type PracticeCreate = components['schemas']['PracticeCreate'];
/** PracticeCreate with the contract defaults optional (difficulty "mixed", exclude_seen false). */
export type PracticeInput = Omit<PracticeCreate, 'difficulty' | 'exclude_seen'> &
  Partial<Pick<PracticeCreate, 'difficulty' | 'exclude_seen'>>;
export type SourceExam = components['schemas']['SourceExam'];
export type TopicStat = components['schemas']['TopicStat'];
export type AppNotification = components['schemas']['Notification'];
export type NotificationPrefs = components['schemas']['NotificationPrefs'];

export const practiceKeys = {
  children: (parentId: string | null) => ['taxonomy', parentId ?? 'root'] as const,
  topics: (parentId: string | null) => ['analytics', 'topics', parentId ?? 'root'] as const,
  overview: ['analytics', 'overview'] as const,
  progress: ['analytics', 'progress'] as const,
  sourceExams: (categoryId: string | null) => ['source-exams', categoryId] as const,
  question: (id: string) => ['question', id] as const,
  list: (kind: 'bookmarks' | 'wrong') => [kind] as const,
  search: (q: string, categoryId: string | null, year: number | null) =>
    ['search', q, categoryId, year] as const,
  notifications: ['notifications'] as const,
};

/** Children of a taxonomy node (root categories when parentId is null). */
export function useTaxonomyChildren(parentId: string | null, enabled = true) {
  const api = useApi();
  return useQuery({
    queryKey: practiceKeys.children(parentId),
    queryFn: () =>
      unwrap(api.GET('/taxonomy', { params: { query: parentId ? { parent_id: parentId } : {} } })),
    staleTime: 10 * 60_000,
    enabled,
  });
}

export function useTopicStats(parentId: string | null) {
  const api = useApi();
  return useQuery({
    queryKey: practiceKeys.topics(parentId),
    queryFn: () =>
      unwrap(
        api.GET('/analytics/topics', {
          params: { query: parentId ? { parent_id: parentId } : {} },
        }),
      ),
  });
}

export function useAnalyticsOverview() {
  const api = useApi();
  return useQuery({
    queryKey: practiceKeys.overview,
    queryFn: () => unwrap(api.GET('/analytics/overview')),
  });
}

export function useAnalyticsProgress() {
  const api = useApi();
  return useQuery({
    queryKey: practiceKeys.progress,
    queryFn: () => unwrap(api.GET('/analytics/progress')),
  });
}

export function useSourceExams(categoryId: string | null) {
  const api = useApi();
  return useQuery({
    queryKey: practiceKeys.sourceExams(categoryId),
    queryFn: () =>
      unwrap(
        api.GET('/source-exams', {
          params: { query: categoryId ? { category_id: categoryId } : {} },
        }),
      ),
  });
}

export function useQuestion(id: string) {
  const api = useApi();
  return useQuery({
    queryKey: practiceKeys.question(id),
    queryFn: () => unwrap(api.GET('/questions/{id}', { params: { path: { id } } })),
  });
}

/** Cursor list of bookmarked or wrongly answered questions (F8). */
export function useQuestionList(kind: 'bookmarks' | 'wrong') {
  const api = useApi();
  return useInfiniteQuery({
    queryKey: practiceKeys.list(kind),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const query = { limit: 20, ...(pageParam ? { cursor: pageParam } : {}) };
      const call =
        kind === 'bookmarks'
          ? api.GET('/bookmarks', { params: { query } })
          : api.GET('/wrong-questions', { params: { query } });
      const res = await call;
      const items = await unwrap(Promise.resolve(res));
      const meta = res.data?.meta;
      return { items, next: meta?.has_more ? (meta.next_cursor ?? undefined) : undefined };
    },
    getNextPageParam: (last) => last.next,
  });
}

export function useBookmarkToggle() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) => {
      const params = { params: { path: { id } } };
      return expectOk(
        on ? api.PUT('/bookmarks/{id}', params) : api.DELETE('/bookmarks/{id}', params),
      );
    },
    onSuccess: (_d, { id, on }) => {
      qc.setQueryData<Question>(practiceKeys.question(id), (q) =>
        q ? { ...q, is_bookmarked: on } : q,
      );
      void qc.invalidateQueries({ queryKey: practiceKeys.list('bookmarks') });
    },
  });
}

export function useSearch(q: string, categoryId: string | null, year: number | null) {
  const api = useApi();
  return useInfiniteQuery({
    queryKey: practiceKeys.search(q, categoryId, year),
    enabled: q.trim().length >= 2,
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const res = await api.GET('/search/questions', {
        params: {
          query: {
            q: q.trim(),
            page: pageParam,
            limit: 20,
            ...(categoryId ? { category_id: categoryId } : {}),
            ...(year ? { year } : {}),
          },
        },
      });
      const hits = await unwrap(Promise.resolve(res));
      const total = res.data?.meta?.total ?? hits.length;
      return { hits, page: pageParam, total };
    },
    getNextPageParam: (last) => (last.page * 20 < last.total ? last.page + 1 : undefined),
  });
}

export function useNotifications() {
  const api = useApi();
  return useInfiniteQuery({
    queryKey: practiceKeys.notifications,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const res = await api.GET('/notifications', {
        params: { query: { limit: 30, ...(pageParam ? { cursor: pageParam } : {}) } },
      });
      const items = await unwrap(Promise.resolve(res));
      const meta = res.data?.meta;
      return {
        items,
        unread: meta?.unread_count ?? 0,
        next: meta?.has_more ? (meta.next_cursor ?? undefined) : undefined,
      };
    },
    getNextPageParam: (last) => last.next,
    refetchInterval: 120_000,
  });
}

export function useMarkRead() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { ids?: string[]; all?: boolean }) =>
      expectOk(api.POST('/notifications/read', { body })),
    onSuccess: () => void qc.invalidateQueries({ queryKey: practiceKeys.notifications }),
  });
}

/** POST /practice/sessions (quick, custom, bookmarks, wrong). */
export function useCreatePractice() {
  const api = useApi();
  return useMutation({
    mutationFn: (input: PracticeInput) =>
      unwrap(
        api.POST('/practice/sessions', {
          body: { difficulty: 'mixed', exclude_seen: false, ...input },
        }),
      ),
  });
}
