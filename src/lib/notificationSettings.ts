export const NOTIFICATION_REMINDER_WINDOW_OPTIONS = ['overdue', 'today', 'within-3-days', 'within-7-days'] as const;
export const NOTIFICATION_RELAUNCH_POLICY_OPTIONS = ['none', 'on-app-launch'] as const;

export type NotificationReminderWindow = (typeof NOTIFICATION_REMINDER_WINDOW_OPTIONS)[number];
export type NotificationRelaunchPolicy = (typeof NOTIFICATION_RELAUNCH_POLICY_OPTIONS)[number];

export type NotificationSettings = {
  enabled: boolean;
  reminderWindow: NotificationReminderWindow;
  relaunchPolicy: NotificationRelaunchPolicy;
};

const STORAGE_KEY = 'line-ops-ledger.notification-settings';

const defaultNotificationSettings: NotificationSettings = {
  enabled: false,
  reminderWindow: 'within-3-days',
  relaunchPolicy: 'on-app-launch',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isReminderWindow(value: unknown): value is NotificationReminderWindow {
  return typeof value === 'string' && NOTIFICATION_REMINDER_WINDOW_OPTIONS.includes(value as NotificationReminderWindow);
}

function isRelaunchPolicy(value: unknown): value is NotificationRelaunchPolicy {
  return typeof value === 'string' && NOTIFICATION_RELAUNCH_POLICY_OPTIONS.includes(value as NotificationRelaunchPolicy);
}

function toNotificationSettings(value: unknown): NotificationSettings | null {
  if (!isRecord(value)) {
    return null;
  }

  const enabled = typeof value.enabled === 'boolean' ? value.enabled : null;
  const reminderWindow = isReminderWindow(value.reminderWindow) ? value.reminderWindow : null;
  const relaunchPolicy = isRelaunchPolicy(value.relaunchPolicy) ? value.relaunchPolicy : null;

  if (enabled == null || !reminderWindow || !relaunchPolicy) {
    return null;
  }

  return {
    enabled,
    reminderWindow,
    relaunchPolicy,
  };
}

export function getDefaultNotificationSettings(): NotificationSettings {
  return { ...defaultNotificationSettings };
}

export function loadNotificationSettings(): NotificationSettings {
  if (typeof window === 'undefined') {
    return getDefaultNotificationSettings();
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return getDefaultNotificationSettings();
    }

    const parsed: unknown = JSON.parse(raw);
    return toNotificationSettings(parsed) ?? getDefaultNotificationSettings();
  } catch (error) {
    console.error('failed to load notification settings', error);
    return getDefaultNotificationSettings();
  }
}

export function saveNotificationSettings(settings: NotificationSettings): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
