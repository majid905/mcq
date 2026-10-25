export { cn } from './lib/cn';
export { fillTemplate, formatClock, formatDecimal, formatInteger } from './lib/format';
export {
  THEME_STORAGE_KEY,
  applyThemePreference,
  readThemePreference,
  subscribeThemePreference,
  themeInitScript,
  type ThemePreference,
} from './theme/theme';
export { ThemeToggle, type ThemeToggleProps } from './theme/theme-toggle';

export { AppButton, appButtonVariants, type AppButtonProps } from './components/app-button';
export { AppTextField, type AppTextFieldProps } from './components/app-text-field';
export {
  OptionTile,
  OPTION_LABELS,
  type OptionTileProps,
  type OptionTileState,
} from './components/option-tile';
export { AppCard, type AppCardProps } from './components/app-card';
export { AppChip, appChipVariants, type AppChipProps } from './components/app-chip';
export { Skeleton } from './components/skeleton';
export { EmptyState, type EmptyStateProps } from './components/empty-state';
export { ErrorState, type ErrorStateProps } from './components/error-state';
export { TimerBar, timerTone, type TimerBarProps, type TimerTone } from './components/timer-bar';
export {
  QuestionNavigator,
  type NavigatorItem,
  type NavigatorStatus,
  type QuestionNavigatorLabels,
  type QuestionNavigatorProps,
} from './components/question-navigator';
export {
  ComponentGallery,
  type GalleryMessages,
  type ComponentGalleryProps,
} from './gallery/component-gallery';
export { OtpInput, type OtpInputProps } from './components/otp-input';
export {
  AppCheckbox,
  AppSwitch,
  SegmentedControl,
  type AppCheckboxProps,
  type AppSwitchProps,
  type SegmentedControlProps,
  type SegmentedOption,
} from './components/form-controls';
export { Avatar, ProgressBar, type AvatarProps, type ProgressBarProps } from './components/display';
export { QuestionCard, type QuestionCardProps } from './components/question-card';
export {
  PremiumLock,
  RankBadge,
  ScoreRing,
  StatTile,
  useCountUp,
  type ScoreRingProps,
  type StatTileProps,
} from './components/result-widgets';
