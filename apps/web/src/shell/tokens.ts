import * as tokens from '@cloudscape-design/design-tokens';
import type { CSSProperties } from 'react';

/**
 * Cloudscape design tokens exposed as CSS custom properties for shell.css (AGENTS.md:
 * custom CSS uses Cloudscape tokens). Token values are `var(...)` references, so they
 * follow the active theme and mode.
 */
export const shellTokenStyle = {
  '--sim-banner-bg': tokens.colorBackgroundNotificationBlue,
  '--sim-banner-text': tokens.colorTextNotificationDefault,
  '--sim-bg-container': tokens.colorBackgroundContainerContent,
  '--sim-bg-layout': tokens.colorBackgroundLayoutMain,
  '--sim-bg-hover': tokens.colorBackgroundDropdownItemHover,
  '--sim-bg-selected': tokens.colorBackgroundItemSelected,
  '--sim-border-selected': tokens.colorBorderItemSelected,
  '--sim-border-dropdown': tokens.colorBorderDropdownContainer,
  '--sim-divider': tokens.colorBorderDividerDefault,
  '--sim-focus': tokens.colorBorderItemFocused,
  '--sim-text-body': tokens.colorTextBodyDefault,
  '--sim-text-secondary': tokens.colorTextBodySecondary,
  '--sim-radius-dropdown': tokens.borderRadiusDropdown,
  '--sim-shadow': tokens.shadowContainerActive,
  '--sim-font-size-s': tokens.fontSizeBodyS,
  '--sim-line-height-s': tokens.lineHeightBodyS,
  '--sim-font-weight-strong': tokens.fontWeightHeadingS,
  '--sim-space-xxs': tokens.spaceScaledXxs,
  '--sim-space-xs': tokens.spaceScaledXs,
  '--sim-space-s': tokens.spaceScaledS,
  '--sim-space-m': tokens.spaceScaledM,
} as CSSProperties;
