export type SubjectKind =
  | 'bangla'
  | 'english'
  | 'math'
  | 'gk_bd'
  | 'gk_intl'
  | 'science'
  | 'banking'
  | 'physics'
  | 'chemistry'
  | 'biology'
  | 'hmath';

export interface TopicDef {
  bn: string;
  en: string;
  slug: string;
}
export interface ChapterDef {
  bn: string;
  en: string;
  slug: string;
  topics: TopicDef[];
}
export interface SubjectDef {
  kind: SubjectKind;
  bn: string;
  en: string;
  slug: string;
  chapters: ChapterDef[];
}
export interface CategoryDef {
  bn: string;
  en: string;
  slug: string;
  icon: string;
  subjects: SubjectKind[];
}

const t = (bn: string, en: string, slug: string): TopicDef => ({ bn, en, slug });
const ch = (bn: string, en: string, slug: string, topics: TopicDef[]): ChapterDef => ({
  bn,
  en,
  slug,
  topics,
});

export const subjectLibrary: Record<SubjectKind, SubjectDef> = {
  bangla: {
    kind: 'bangla',
    bn: 'বাংলা ভাষা ও সাহিত্য',
    en: 'Bangla Language and Literature',
    slug: 'bangla',
    chapters: [
      ch('ব্যাকরণ', 'Grammar', 'grammar', [
        t('সন্ধি ও সমাস', 'Sandhi and Samas', 'sandhi-samas'),
        t('বাগধারা ও প্রবাদ', 'Idioms and Proverbs', 'idioms-proverbs'),
      ]),
      ch('সাহিত্য', 'Literature', 'literature', [
        t('প্রাচীন ও মধ্যযুগ', 'Old and Medieval Period', 'old-medieval'),
        t('আধুনিক যুগ', 'Modern Period', 'modern'),
      ]),
    ],
  },
  english: {
    kind: 'english',
    bn: 'ইংরেজি ভাষা ও সাহিত্য',
    en: 'English Language and Literature',
    slug: 'english',
    chapters: [
      ch('গ্রামার', 'Grammar', 'grammar', [
        t('Tense and Verb', 'Tense and Verb', 'tense-verb'),
        t('Parts of Speech', 'Parts of Speech', 'parts-of-speech'),
      ]),
      ch('ভোকাবুলারি', 'Vocabulary', 'vocabulary', [
        t('Synonyms and Antonyms', 'Synonyms and Antonyms', 'syn-ant'),
        t('Idioms and Phrases', 'Idioms and Phrases', 'idioms-phrases'),
      ]),
    ],
  },
  math: {
    kind: 'math',
    bn: 'গণিত ও মানসিক দক্ষতা',
    en: 'Mathematics',
    slug: 'math',
    chapters: [
      ch('পাটিগণিত', 'Arithmetic', 'arithmetic', [
        t('ল.সা.গু. ও গ.সা.গু.', 'LCM and GCD', 'lcm-gcd'),
        t('শতকরা ও লাভ-ক্ষতি', 'Percentage and Profit-Loss', 'percent-profit'),
      ]),
      ch('সুদ ও গড়', 'Interest and Average', 'interest-average', [
        t('সরল সুদ', 'Simple Interest', 'simple-interest'),
        t('গড় ও অনুপাত', 'Average and Ratio', 'average-ratio'),
      ]),
      ch('গতি ও কাজ', 'Speed and Work', 'speed-work', [
        t('সময় ও দূরত্ব', 'Time and Distance', 'time-distance'),
        t('কাজ ও সময়', 'Work and Time', 'work-time'),
      ]),
    ],
  },
  gk_bd: {
    kind: 'gk_bd',
    bn: 'বাংলাদেশ বিষয়াবলি',
    en: 'Bangladesh Affairs',
    slug: 'bangladesh-affairs',
    chapters: [
      ch('ইতিহাস ও মুক্তিযুদ্ধ', 'History and Liberation War', 'history', [
        t('ভাষা আন্দোলন ও স্বাধীনতা', 'Language Movement and Independence', 'language-liberation'),
        t('সংবিধান ও রাষ্ট্র', 'Constitution and State', 'constitution'),
      ]),
      ch('ভূগোল ও অর্থনীতি', 'Geography and Economy', 'geo-economy', [
        t('ভূপ্রকৃতি ও নদী', 'Geography and Rivers', 'geography-rivers'),
        t('অর্থনীতি ও উন্নয়ন', 'Economy and Development', 'economy-development'),
      ]),
    ],
  },
  gk_intl: {
    kind: 'gk_intl',
    bn: 'আন্তর্জাতিক বিষয়াবলি',
    en: 'International Affairs',
    slug: 'international-affairs',
    chapters: [
      ch('সংস্থা ও সম্মেলন', 'Organizations', 'organizations', [
        t('জাতিসংঘ ও সংস্থা', 'United Nations and Agencies', 'un-agencies'),
        t('আঞ্চলিক জোট', 'Regional Blocs', 'regional-blocs'),
      ]),
      ch('বিশ্ব ভূগোল', 'World Geography', 'world-geography', [
        t('মহাদেশ ও মহাসাগর', 'Continents and Oceans', 'continents-oceans'),
        t('দেশ ও রাজধানী', 'Countries and Capitals', 'countries-capitals'),
      ]),
    ],
  },
  science: {
    kind: 'science',
    bn: 'সাধারণ বিজ্ঞান',
    en: 'General Science',
    slug: 'general-science',
    chapters: [
      ch('পদার্থ ও রসায়ন', 'Physical Science', 'physical-science', [
        t('বল ও গতি', 'Force and Motion', 'force-motion'),
        t('পদার্থের গঠন', 'Structure of Matter', 'matter'),
      ]),
      ch('জীব ও পরিবেশ', 'Life and Environment', 'life-environment', [
        t('মানবদেহ', 'Human Body', 'human-body'),
        t('পরিবেশ ও জলবায়ু', 'Environment and Climate', 'environment-climate'),
      ]),
    ],
  },
  banking: {
    kind: 'banking',
    bn: 'ব্যাংকিং ও অর্থনীতি',
    en: 'Banking and Economics',
    slug: 'banking-economics',
    chapters: [
      ch('ব্যাংকিং', 'Banking', 'banking', [
        t('ব্যাংকিং পরিচিতি', 'Banking Basics', 'banking-basics'),
        t('কেন্দ্রীয় ব্যাংক ও মুদ্রানীতি', 'Central Bank and Monetary Policy', 'central-bank'),
      ]),
      ch('অর্থনীতি', 'Economics', 'economics', [
        t('মুদ্রাস্ফীতি ও বাজার', 'Inflation and Markets', 'inflation-markets'),
        t('আন্তর্জাতিক অর্থনীতি', 'International Economics', 'intl-economics'),
      ]),
    ],
  },
  physics: {
    kind: 'physics',
    bn: 'পদার্থবিজ্ঞান',
    en: 'Physics',
    slug: 'physics',
    chapters: [
      ch('বলবিদ্যা', 'Mechanics', 'mechanics', [
        t('নিউটনের গতিসূত্র', "Newton's Laws", 'newton-laws'),
        t('কাজ ও শক্তি', 'Work and Energy', 'work-energy'),
      ]),
      ch('তড়িৎ', 'Electricity', 'electricity', [
        t('স্থির তড়িৎ', 'Electrostatics', 'electrostatics'),
        t('চল তড়িৎ', 'Current Electricity', 'current-electricity'),
      ]),
    ],
  },
  chemistry: {
    kind: 'chemistry',
    bn: 'রসায়ন',
    en: 'Chemistry',
    slug: 'chemistry',
    chapters: [
      ch('পরমাণু ও পর্যায় সারণি', 'Atoms and Periodic Table', 'atoms-periodic', [
        t('পরমাণুর গঠন', 'Atomic Structure', 'atomic-structure'),
        t('পর্যায় সারণি', 'Periodic Table', 'periodic-table'),
      ]),
      ch('দ্রবণ ও বিক্রিয়া', 'Solutions and Reactions', 'solutions-reactions', [
        t('অম্ল-ক্ষারক', 'Acids and Bases', 'acid-base'),
        t('রাসায়নিক সাম্য', 'Chemical Equilibrium', 'equilibrium'),
      ]),
    ],
  },
  biology: {
    kind: 'biology',
    bn: 'জীববিজ্ঞান',
    en: 'Biology',
    slug: 'biology',
    chapters: [
      ch('কোষ ও জিন', 'Cell and Genes', 'cell-genes', [
        t('কোষ বিভাজন', 'Cell Division', 'cell-division'),
        t('জিনতত্ত্ব', 'Genetics', 'genetics'),
      ]),
      ch('উদ্ভিদ ও প্রাণী', 'Plants and Animals', 'plants-animals', [
        t('সালোকসংশ্লেষণ', 'Photosynthesis', 'photosynthesis'),
        t('মানব শারীরতত্ত্ব', 'Human Physiology', 'human-physiology'),
      ]),
    ],
  },
  hmath: {
    kind: 'hmath',
    bn: 'উচ্চতর গণিত',
    en: 'Higher Mathematics',
    slug: 'higher-math',
    chapters: [
      ch('বীজগণিত', 'Algebra', 'algebra', [
        t('সেট ও ফাংশন', 'Sets and Functions', 'sets-functions'),
        t('ম্যাট্রিক্স', 'Matrices', 'matrices'),
      ]),
      ch('ত্রিকোণমিতি ও ক্যালকুলাস', 'Trigonometry and Calculus', 'trig-calculus', [
        t('ত্রিকোণমিতি', 'Trigonometry', 'trigonometry'),
        t('অন্তরীকরণ', 'Differentiation', 'differentiation'),
      ]),
    ],
  },
};

// Order matters: ids 1..5 in this order (the contract examples use BCS = 1).
export const categories: CategoryDef[] = [
  {
    bn: 'বিসিএস',
    en: 'BCS',
    slug: 'bcs',
    icon: 'graduation-cap',
    subjects: ['bangla', 'english', 'math', 'gk_bd', 'gk_intl', 'science'],
  },
  {
    bn: 'ব্যাংক',
    en: 'Bank',
    slug: 'bank',
    icon: 'landmark',
    subjects: ['bangla', 'english', 'math', 'gk_bd', 'banking'],
  },
  {
    bn: 'প্রাইমারি',
    en: 'Primary',
    slug: 'primary',
    icon: 'school',
    subjects: ['bangla', 'english', 'math', 'gk_bd', 'science'],
  },
  {
    bn: 'এনটিআরসিএ',
    en: 'NTRCA',
    slug: 'ntrca',
    icon: 'book-open',
    subjects: ['bangla', 'english', 'math', 'gk_bd'],
  },
  {
    bn: 'ভর্তি পরীক্ষা',
    en: 'Admission',
    slug: 'admission',
    icon: 'pencil',
    subjects: ['physics', 'chemistry', 'biology', 'hmath', 'english'],
  },
];
