import type { Template } from './notification.service';

/** FR-EXAM-02: "set reminder" pushes at 15 minutes and 1 minute before the start. */
export function examReminder(
  exam: { id: bigint; title_bn: string; title_en: string },
  minutes: number,
): Template {
  return {
    type: 'exam_reminder',
    bn: {
      title: 'পরীক্ষা শুরু হচ্ছে',
      body: `"${exam.title_bn}" ${minutes} মিনিট পরে শুরু হবে। প্রস্তুত হয়ে নিন।`,
    },
    en: {
      title: 'Exam starting soon',
      body: `"${exam.title_en}" starts in ${minutes} minute${minutes === 1 ? '' : 's'}. Get ready.`,
    },
    deepLink: `/exams/${exam.id}`,
  };
}

/** FR-RES-02: final merit list published. */
export function meritPublished(exam: { id: bigint; title_bn: string; title_en: string }): Template {
  return {
    type: 'result',
    bn: {
      title: 'মেধাতালিকা প্রকাশিত',
      body: `"${exam.title_bn}" পরীক্ষার চূড়ান্ত মেধাতালিকা প্রকাশিত হয়েছে। আপনার অবস্থান দেখুন।`,
    },
    en: {
      title: 'Merit list published',
      body: `The final merit list of "${exam.title_en}" is out. See your rank.`,
    },
    deepLink: `/exams/${exam.id}/leaderboard`,
  };
}
