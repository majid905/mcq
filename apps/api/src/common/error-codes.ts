/** HTTP status per error code. Source: docs/04-API.md section 4 (+ INTERNAL_ERROR). */
export const ERROR_STATUS = {
  VALIDATION_FAILED: 400,
  OTP_INVALID: 400,
  OTP_EXPIRED: 400,
  UNAUTHENTICATED: 401,
  INVALID_CREDENTIALS: 401,
  SESSION_REVOKED: 401,
  PREMIUM_REQUIRED: 402,
  QUOTA_EXHAUSTED: 402,
  FORBIDDEN: 403,
  SOLUTIONS_LOCKED: 403,
  NOT_FOUND: 404,
  PHONE_EXISTS: 409,
  ALREADY_ATTEMPTED: 409,
  DUPLICATE_QUESTION: 409,
  ALREADY_REPORTED: 409,
  TRIAL_USED: 409,
  IN_USE: 409,
  CONFLICT: 409,
  ATTEMPT_CLOSED: 410,
  NOT_ENOUGH_QUESTIONS: 422,
  COUPON_INVALID: 422,
  EXAM_NOT_PUBLISHABLE: 422,
  ACCOUNT_LOCKED: 423,
  EXAM_NOT_STARTED: 425,
  UPGRADE_REQUIRED: 426,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  MAINTENANCE: 503,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;
export type Locale = 'bn' | 'en';

/** Default messages, localized by Accept-Language (bn is the default). */
export const ERROR_MESSAGES: Record<ErrorCode, Record<Locale, string>> = {
  VALIDATION_FAILED: { bn: 'প্রদত্ত তথ্য সঠিক নয়', en: 'The submitted data is invalid' },
  OTP_INVALID: { bn: 'ওটিপি সঠিক নয়', en: 'The OTP is incorrect' },
  OTP_EXPIRED: { bn: 'ওটিপির মেয়াদ শেষ হয়েছে', en: 'The OTP has expired' },
  UNAUTHENTICATED: { bn: 'অনুগ্রহ করে লগইন করুন', en: 'Please sign in' },
  INVALID_CREDENTIALS: {
    bn: 'ফোন নম্বর বা পাসওয়ার্ড সঠিক নয়',
    en: 'Phone number or password is incorrect',
  },
  SESSION_REVOKED: {
    bn: 'আপনার সেশন শেষ হয়েছে, আবার লগইন করুন',
    en: 'Your session has ended, please sign in again',
  },
  PREMIUM_REQUIRED: { bn: 'এটি প্রিমিয়াম কনটেন্ট', en: 'This is premium content' },
  QUOTA_EXHAUSTED: { bn: 'আপনার ফ্রি সীমা শেষ হয়েছে', en: 'Your free limit is used up' },
  FORBIDDEN: { bn: 'এই কাজের অনুমতি আপনার নেই', en: 'You do not have permission to do this' },
  SOLUTIONS_LOCKED: {
    bn: 'পরীক্ষা শেষ হওয়ার পর সমাধান দেখা যাবে',
    en: 'Solutions open after the exam ends',
  },
  NOT_FOUND: { bn: 'খুঁজে পাওয়া যায়নি', en: 'Not found' },
  PHONE_EXISTS: {
    bn: 'এই ফোন নম্বর দিয়ে আগেই নিবন্ধন করা হয়েছে',
    en: 'This phone number is already registered',
  },
  ALREADY_ATTEMPTED: {
    bn: 'আপনি আগেই এই পরীক্ষা দিয়েছেন',
    en: 'You have already taken this exam',
  },
  DUPLICATE_QUESTION: { bn: 'প্রশ্নটি আগে থেকেই আছে', en: 'This question already exists' },
  ALREADY_REPORTED: {
    bn: 'আপনি এই কারণে আগেই রিপোর্ট করেছেন',
    en: 'You have already reported this question for that reason',
  },
  TRIAL_USED: {
    bn: 'ফ্রি ট্রায়াল আগেই ব্যবহার করা হয়েছে',
    en: 'The free trial has already been used',
  },
  IN_USE: {
    bn: 'এটি ব্যবহৃত হচ্ছে, মুছে ফেলা যাবে না',
    en: 'This is in use and cannot be deleted',
  },
  CONFLICT: { bn: 'এই তথ্য আগে থেকেই আছে', en: 'This already exists' },
  ATTEMPT_CLOSED: { bn: 'পরীক্ষার সময় শেষ', en: 'The attempt is closed' },
  NOT_ENOUGH_QUESTIONS: {
    bn: 'এই বিষয়ে যথেষ্ট প্রশ্ন নেই',
    en: 'Not enough questions for this selection',
  },
  COUPON_INVALID: {
    bn: 'কুপনটি সঠিক নয় বা মেয়াদোত্তীর্ণ',
    en: 'The coupon is invalid or expired',
  },
  EXAM_NOT_PUBLISHABLE: { bn: 'পরীক্ষা প্রকাশ করা যাচ্ছে না', en: 'The exam cannot be published' },
  ACCOUNT_LOCKED: {
    bn: 'অনেকবার ভুল চেষ্টার কারণে অ্যাকাউন্ট সাময়িক বন্ধ',
    en: 'Account locked after too many failed attempts',
  },
  EXAM_NOT_STARTED: { bn: 'পরীক্ষা এখনো শুরু হয়নি', en: 'The exam has not started yet' },
  UPGRADE_REQUIRED: { bn: 'অ্যাপটি আপডেট করুন', en: 'Please update the app' },
  RATE_LIMITED: {
    bn: 'অনেক বেশি অনুরোধ, একটু পরে চেষ্টা করুন',
    en: 'Too many requests, try again shortly',
  },
  INTERNAL_ERROR: {
    bn: 'সার্ভারে সমস্যা হয়েছে, আবার চেষ্টা করুন',
    en: 'Something went wrong on our side',
  },
  MAINTENANCE: { bn: 'সার্ভার রক্ষণাবেক্ষণের কাজ চলছে', en: 'We are under maintenance' },
};
