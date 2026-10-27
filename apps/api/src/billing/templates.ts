import type { Template } from '../notifications/notification.service';

export function subscriptionActivated(endsAt: Date): Template {
  const bn = endsAt.toLocaleDateString('bn-BD', { timeZone: 'Asia/Dhaka', dateStyle: 'long' });
  const en = endsAt.toLocaleDateString('en-GB', { timeZone: 'Asia/Dhaka', dateStyle: 'long' });
  return {
    type: 'subscription',
    bn: { title: 'প্রিমিয়াম চালু হয়েছে', body: `আপনার প্রিমিয়াম ${bn} পর্যন্ত চালু থাকবে।` },
    en: { title: 'Premium is active', body: `Your premium runs until ${en}.` },
    deepLink: '/profile/payments',
  };
}

/** FR-PAY-05: 3 days and 1 day before the subscription ends. */
export function subscriptionExpiring(days: number): Template {
  return {
    type: 'subscription',
    bn: {
      title: 'প্রিমিয়াম শেষ হতে চলেছে',
      body: `আপনার প্রিমিয়াম ${days} দিন পরে শেষ হবে। চালু রাখতে নবায়ন করুন।`,
    },
    en: {
      title: 'Premium ends soon',
      body: `Your premium ends in ${days} day${days === 1 ? '' : 's'}. Renew to keep access.`,
    },
    deepLink: '/plans',
  };
}
