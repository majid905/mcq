/**
 * The 64 districts with the ids the API uses (database/seed/data/districts.ts, Dhaka = 1).
 * Temporary copy: there is no districts endpoint yet (contract-change request: GET /districts).
 */
export interface District {
  id: number;
  bn: string;
  en: string;
}

export const DISTRICTS: District[] = [
  { id: 1, bn: 'ঢাকা', en: 'Dhaka' },
  { id: 2, bn: 'ফরিদপুর', en: 'Faridpur' },
  { id: 3, bn: 'গাজীপুর', en: 'Gazipur' },
  { id: 4, bn: 'গোপালগঞ্জ', en: 'Gopalganj' },
  { id: 5, bn: 'কিশোরগঞ্জ', en: 'Kishoreganj' },
  { id: 6, bn: 'মাদারীপুর', en: 'Madaripur' },
  { id: 7, bn: 'মানিকগঞ্জ', en: 'Manikganj' },
  { id: 8, bn: 'মুন্সিগঞ্জ', en: 'Munshiganj' },
  { id: 9, bn: 'নারায়ণগঞ্জ', en: 'Narayanganj' },
  { id: 10, bn: 'নরসিংদী', en: 'Narsingdi' },
  { id: 11, bn: 'রাজবাড়ী', en: 'Rajbari' },
  { id: 12, bn: 'শরীয়তপুর', en: 'Shariatpur' },
  { id: 13, bn: 'টাঙ্গাইল', en: 'Tangail' },
  { id: 14, bn: 'বান্দরবান', en: 'Bandarban' },
  { id: 15, bn: 'ব্রাহ্মণবাড়িয়া', en: 'Brahmanbaria' },
  { id: 16, bn: 'চাঁদপুর', en: 'Chandpur' },
  { id: 17, bn: 'চট্টগ্রাম', en: 'Chattogram' },
  { id: 18, bn: 'কুমিল্লা', en: 'Cumilla' },
  { id: 19, bn: 'কক্সবাজার', en: "Cox's Bazar" },
  { id: 20, bn: 'ফেনী', en: 'Feni' },
  { id: 21, bn: 'খাগড়াছড়ি', en: 'Khagrachhari' },
  { id: 22, bn: 'লক্ষ্মীপুর', en: 'Lakshmipur' },
  { id: 23, bn: 'নোয়াখালী', en: 'Noakhali' },
  { id: 24, bn: 'রাঙ্গামাটি', en: 'Rangamati' },
  { id: 25, bn: 'বগুড়া', en: 'Bogura' },
  { id: 26, bn: 'জয়পুরহাট', en: 'Joypurhat' },
  { id: 27, bn: 'নওগাঁ', en: 'Naogaon' },
  { id: 28, bn: 'নাটোর', en: 'Natore' },
  { id: 29, bn: 'চাঁপাইনবাবগঞ্জ', en: 'Chapainawabganj' },
  { id: 30, bn: 'পাবনা', en: 'Pabna' },
  { id: 31, bn: 'রাজশাহী', en: 'Rajshahi' },
  { id: 32, bn: 'সিরাজগঞ্জ', en: 'Sirajganj' },
  { id: 33, bn: 'বাগেরহাট', en: 'Bagerhat' },
  { id: 34, bn: 'চুয়াডাঙ্গা', en: 'Chuadanga' },
  { id: 35, bn: 'যশোর', en: 'Jashore' },
  { id: 36, bn: 'ঝিনাইদহ', en: 'Jhenaidah' },
  { id: 37, bn: 'খুলনা', en: 'Khulna' },
  { id: 38, bn: 'কুষ্টিয়া', en: 'Kushtia' },
  { id: 39, bn: 'মাগুরা', en: 'Magura' },
  { id: 40, bn: 'মেহেরপুর', en: 'Meherpur' },
  { id: 41, bn: 'নড়াইল', en: 'Narail' },
  { id: 42, bn: 'সাতক্ষীরা', en: 'Satkhira' },
  { id: 43, bn: 'বরগুনা', en: 'Barguna' },
  { id: 44, bn: 'বরিশাল', en: 'Barishal' },
  { id: 45, bn: 'ভোলা', en: 'Bhola' },
  { id: 46, bn: 'ঝালকাঠি', en: 'Jhalokati' },
  { id: 47, bn: 'পটুয়াখালী', en: 'Patuakhali' },
  { id: 48, bn: 'পিরোজপুর', en: 'Pirojpur' },
  { id: 49, bn: 'হবিগঞ্জ', en: 'Habiganj' },
  { id: 50, bn: 'মৌলভীবাজার', en: 'Moulvibazar' },
  { id: 51, bn: 'সুনামগঞ্জ', en: 'Sunamganj' },
  { id: 52, bn: 'সিলেট', en: 'Sylhet' },
  { id: 53, bn: 'দিনাজপুর', en: 'Dinajpur' },
  { id: 54, bn: 'গাইবান্ধা', en: 'Gaibandha' },
  { id: 55, bn: 'কুড়িগ্রাম', en: 'Kurigram' },
  { id: 56, bn: 'লালমনিরহাট', en: 'Lalmonirhat' },
  { id: 57, bn: 'নীলফামারী', en: 'Nilphamari' },
  { id: 58, bn: 'পঞ্চগড়', en: 'Panchagarh' },
  { id: 59, bn: 'রংপুর', en: 'Rangpur' },
  { id: 60, bn: 'ঠাকুরগাঁও', en: 'Thakurgaon' },
  { id: 61, bn: 'জামালপুর', en: 'Jamalpur' },
  { id: 62, bn: 'ময়মনসিংহ', en: 'Mymensingh' },
  { id: 63, bn: 'নেত্রকোণা', en: 'Netrokona' },
  { id: 64, bn: 'শেরপুর', en: 'Sherpur' },
];

export function districtName(id: number | null | undefined, locale: string): string | undefined {
  const d = DISTRICTS.find((x) => x.id === id);
  return d ? (locale === 'bn' ? d.bn : d.en) : undefined;
}
