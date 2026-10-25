import {
  BookOpen,
  GraduationCap,
  Landmark,
  Layers,
  type LucideProps,
  Pencil,
  School,
} from 'lucide-react';

/** `TaxonomyNode.icon` holds a Lucide name; only the ones the seed uses are bundled. */
const ICONS = {
  'graduation-cap': GraduationCap,
  landmark: Landmark,
  school: School,
  'book-open': BookOpen,
  pencil: Pencil,
} as const;

export function CategoryIcon({
  icon,
  ...props
}: { icon: string | null | undefined } & Omit<LucideProps, 'name'>) {
  const Icon = (icon && ICONS[icon as keyof typeof ICONS]) || Layers;
  return <Icon aria-hidden strokeWidth={1.75} {...props} />;
}
