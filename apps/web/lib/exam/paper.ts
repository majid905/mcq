import { type components, shufflePaper } from '@mcq/api-client-ts';

export type Paper = components['schemas']['Paper'];
export type AttemptStart = components['schemas']['AttemptStart'];
export type OptionKey = components['schemas']['OptionKey'];

export interface RoomOption {
  /** Original key; this is what gets submitted (docs/04-API.md section 6). */
  key: OptionKey;
  html: string;
}

export interface RoomQuestion {
  id: string;
  body: string;
  /** Display order (after shuffle). Labels ক/খ/গ… come from the position. */
  options: RoomOption[];
  /** Index into RoomPaper.sections. */
  section: number;
}

export interface RoomSection {
  nodeId: string;
  label: string;
  questionIds: string[];
}

export interface RoomPaper {
  examId: string | null;
  version: number;
  sections: RoomSection[];
  questions: Record<string, RoomQuestion>;
  /** Every question id in display order, across sections. */
  order: string[];
}

export type ShuffleSettings = Pick<
  AttemptStart,
  'shuffle_seed' | 'shuffle_questions' | 'shuffle_options'
>;

/** Applies the shared deterministic shuffle so web, app and server agree on the order. */
export function buildRoomPaper(paper: Paper, settings: ShuffleSettings): RoomPaper {
  const byId = new Map((paper.questions ?? []).map((q) => [q.id ?? '', q]));
  const rawSections =
    paper.sections && paper.sections.length > 0
      ? paper.sections
      : [{ node_id: '0', label: '', question_ids: [...byId.keys()] }];

  const seed = settings.shuffle_seed;
  const shuffled =
    seed !== null && seed !== undefined && (settings.shuffle_questions || settings.shuffle_options)
      ? shufflePaper({
          seed,
          shuffleQuestions: Boolean(settings.shuffle_questions),
          shuffleOptions: Boolean(settings.shuffle_options),
          sections: rawSections.map((s) => ({ question_ids: s.question_ids ?? [] })),
          options: Object.fromEntries(
            [...byId].map(([id, q]) => [id, (q.options ?? []).map((o) => o.key)]),
          ),
        })
      : {
          sections: rawSections.map((s) => [...(s.question_ids ?? [])]),
          options: Object.fromEntries(
            [...byId].map(([id, q]) => [id, (q.options ?? []).map((o) => o.key)]),
          ),
        };

  const sections: RoomSection[] = [];
  const questions: Record<string, RoomQuestion> = {};
  const order: string[] = [];
  shuffled.sections.forEach((ids, index) => {
    const raw = rawSections[index];
    const kept = ids.filter((id) => byId.has(id));
    sections.push({
      nodeId: raw?.node_id ?? String(index),
      label: raw?.label ?? '',
      questionIds: kept,
    });
    for (const id of kept) {
      const q = byId.get(id)!;
      const html = new Map((q.options ?? []).map((o) => [o.key, o.html]));
      questions[id] = {
        id,
        body: q.body ?? '',
        section: index,
        options: (shuffled.options[id] ?? []).map((key) => ({
          key: key as OptionKey,
          html: html.get(key as OptionKey) ?? '',
        })),
      };
      order.push(id);
    }
  });

  return { examId: paper.exam_id ?? null, version: paper.version ?? 0, sections, questions, order };
}

/**
 * Paper from the CDN (`paper_url`), verified against the exam id; falls back to the API
 * (docs/04-API.md section 7). Inline papers (practice) need neither.
 */
export async function loadPaper(
  start: AttemptStart,
  examId: string,
  fallback: () => Promise<Paper>,
): Promise<Paper> {
  if (start.paper) return start.paper;
  if (start.paper_url) {
    try {
      const res = await fetch(start.paper_url, { cache: 'force-cache' });
      if (res.ok) {
        const json = (await res.json()) as Paper | { data?: Paper };
        const paper = 'data' in json && json.data ? json.data : (json as Paper);
        if (String(paper.exam_id) === examId && Array.isArray(paper.questions)) return paper;
      }
    } catch {
      // CDN down or blocked: use the API copy.
    }
  }
  return fallback();
}
