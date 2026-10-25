import { AppButton, AppChip, OPTION_LABELS, OptionTile } from '@mcq/ui';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { QuestionDetail } from '@/components/questions/question-detail';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { renderRichHtml, richToText } from '@/lib/rich-html';
import { publicApi, publicData } from '@/lib/server/public-api';

type Params = Promise<{ locale: string; slug: string }>;

async function load(locale: string, slug: string) {
  return publicData(
    publicApi(locale, 3600).GET('/public/questions/{slug}', { params: { path: { slug } } }),
  );
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, slug } = await params;
  const q = await load(locale, slug);
  if (!q) return { title: 'MCQ', robots: { index: false } };
  const text = richToText(q.body);
  return {
    title: text.length > 70 ? `${text.slice(0, 67)}…` : text,
    description: richToText(q.explanation).slice(0, 155) || text.slice(0, 155),
    alternates: { languages: { bn: `/questions/${slug}`, en: `/en/questions/${slug}` } },
  };
}

/**
 * K `/questions/:slug` (FR-WEB-02): server-rendered public question with schema.org QAPage.
 * Numeric ids that are not public slugs are the in-app F9 page (signed in, answer locked by plan).
 */
export default async function QuestionPage({ params }: { params: Params }) {
  const { locale, slug } = await params;
  setRequestLocale(locale as Locale);
  const q = await load(locale, slug);
  if (!q) {
    if (/^\d+$/.test(slug)) {
      return (
        <div className="px-4 py-8">
          <QuestionDetail id={slug} />
        </div>
      );
    }
    notFound();
  }

  const t = await getTranslations('question');
  const labels = locale === 'bn' ? OPTION_LABELS.bn : OPTION_LABELS.en;
  const showAnswer = !q.answer_locked && Boolean(q.correct_option);
  const correct = (q.options ?? []).find((o) => o.key === q.correct_option);
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'QAPage',
    mainEntity: {
      '@type': 'Question',
      name: richToText(q.body),
      text: richToText(q.body),
      answerCount: (q.options ?? []).length,
      ...(showAnswer && correct
        ? { acceptedAnswer: { '@type': 'Answer', text: richToText(correct.html) } }
        : {}),
      suggestedAnswer: (q.options ?? [])
        .filter((o) => o.key !== q.correct_option)
        .map((o) => ({ '@type': 'Answer', text: richToText(o.html) })),
    },
  };

  return (
    <article className="mx-auto flex max-w-reading flex-col gap-5 px-4 py-10">
      <script
        type="application/ld+json"
        // JSON.stringify output with "<" escaped cannot break out of the script element.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <div className="flex flex-wrap gap-2">
        {q.source_label && <AppChip variant="primary">{q.source_label}</AppChip>}
        {q.topic && <AppChip>{locale === 'bn' ? q.topic.name_bn : q.topic.name_en}</AppChip>}
      </div>
      <h1
        className="mcq-html text-h2 font-semibold leading-relaxed text-text"
        dangerouslySetInnerHTML={{ __html: renderRichHtml(q.body) }}
      />
      <ol className="flex flex-col gap-2">
        {(q.options ?? []).map((o, i) => (
          <li key={o.key}>
            <OptionTile
              label={labels[i] ?? o.key}
              state={showAnswer && o.key === q.correct_option ? 'correct' : 'idle'}
              statusLabel={
                showAnswer && o.key === q.correct_option ? t('correctAnswer') : undefined
              }
            >
              <span
                className="mcq-html"
                dangerouslySetInnerHTML={{ __html: renderRichHtml(o.html) }}
              />
            </OptionTile>
          </li>
        ))}
      </ol>
      {showAnswer && q.explanation && (
        <section className="rounded-lg bg-surface-muted p-4">
          <h2 className="text-h3 font-semibold text-text">{t('explanation')}</h2>
          <div
            className="mcq-html mt-2 text-body leading-relaxed text-text"
            dangerouslySetInnerHTML={{ __html: renderRichHtml(q.explanation) }}
          />
        </section>
      )}
      {!showAnswer && (
        <p className="rounded-md bg-accent-soft px-4 py-3 text-body-sm text-text">
          {t('loginForAnswer')}
        </p>
      )}
      <AppButton asChild>
        <Link href={q.topic?.id ? `/practice/node/${q.topic.id}` : '/practice'}>
          {t('practiceMore')}
        </Link>
      </AppButton>
    </article>
  );
}
