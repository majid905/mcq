/**
 * Public links for the landing page and footer. Each one is hidden until its env var is set, so the
 * site never links to a store listing or profile that does not exist yet.
 */
const value = (v: string | undefined) => (v && v.trim() ? v.trim() : null);

export const site = {
  playStoreUrl: value(process.env.NEXT_PUBLIC_PLAY_STORE_URL),
  appStoreUrl: value(process.env.NEXT_PUBLIC_APP_STORE_URL),
  supportEmail: value(process.env.NEXT_PUBLIC_SUPPORT_EMAIL),
  social: {
    facebook: value(process.env.NEXT_PUBLIC_FACEBOOK_URL),
    youtube: value(process.env.NEXT_PUBLIC_YOUTUBE_URL),
    linkedin: value(process.env.NEXT_PUBLIC_LINKEDIN_URL),
    instagram: value(process.env.NEXT_PUBLIC_INSTAGRAM_URL),
  },
};

export type SocialNetwork = keyof typeof site.social;
