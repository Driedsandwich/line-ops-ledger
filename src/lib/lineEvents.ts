import {
  calculateFiberDebtClearDate,
  calculateFiberRemainingDebt,
  calculateSafeExitDate,
  diffInDays,
  findRelatedHistoryEntriesForDraft,
  getLatestActivityDateFromEntries,
  parseReviewDate,
  startOfDay,
} from './lineAnalytics';
import type { LineDraft } from './lineDrafts';
import type { LineHistoryEntry } from './lineHistory';

export type EventSeverity = 'critical' | 'warning' | 'watch';

export type LineEventOrigin = 'line' | 'history';

export type LineEvent = {
  id: string;
  kind:
    | 'safeExit'
    | 'contractEnd'
    | 'plannedAction'
    | 'mnpDeadline'
    | 'freeOptionDeadline'
    | 'benefitDeadline'
    | 'fiberDebt'
    | 'notificationTarget'
    | 'usageShortage'
    | 'inactiveLine';
  severity: EventSeverity;
  origin: LineEventOrigin;
  title: string;
  summary: string;
  detail: string;
  meta: string[];
  draftId: string;
  draftName: string;
  phoneNumber: string;
  carrier: string;
  status: LineDraft['status'];
  dueDateIso: string | null;
  dueDateLabel: string | null;
  to: string;
  ctaLabel: string;
  sortKey: number;
};

export type LineEventGroup = {
  severity: EventSeverity;
  label: string;
  description: string;
  tone: 'danger' | 'warn' | 'info';
  events: LineEvent[];
};

export type LineEventMonthGroup = {
  monthKey: string;
  monthLabel: string;
  events: LineEvent[];
};

const SAFE_EXIT_DAYS = 181;
const CONTRACT_END_ALERT_DAYS = 30;
const PLANNED_ACTION_ALERT_DAYS = 60;
const DEADLINE_ALERT_DAYS = 3;
const BENEFIT_ALERT_DAYS = 30;
const FIBER_DEBT_ALERT_DAYS = 60;
const USAGE_SUMMARY_DAYS = 180;
const INACTIVE_THRESHOLD_DAYS = 90;

type UsagePriorityKind = 'communication' | 'call' | 'sms';

type UsageSummary = {
  hasCommunication: boolean;
  hasCall: boolean;
  hasSms: boolean;
  lastActivityDate: string | null;
  missingKinds: UsagePriorityKind[];
};

function formatDateLabel(value: Date): string {
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}

function formatDateIso(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatMonthKey(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function formatMonthLabel(value: Date): string {
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: 'long',
  }).format(value);
}

function formatRelativeDayLabel(daysUntil: number): string {
  if (daysUntil < 0) {
    return `${Math.abs(daysUntil)}日超過`;
  }
  if (daysUntil === 0) {
    return '今日';
  }
  return `あと${daysUntil}日`;
}

function buildUsageSummary(entries: LineHistoryEntry[]): UsageSummary {
  const cutoff = startOfDay(new Date());
  cutoff.setDate(cutoff.getDate() - USAGE_SUMMARY_DAYS);

  let hasCommunication = false;
  let hasCall = false;
  let hasSms = false;
  let lastActivityDate: string | null = null;

  for (const entry of entries) {
    for (const log of entry.activityLogs) {
      const activityDate = parseReviewDate(log.activityDate);
      if (!activityDate || activityDate < cutoff) {
        continue;
      }

      if (log.activityType === '通信実施') {
        hasCommunication = true;
      }
      if (log.activityType === '通話実施') {
        hasCall = true;
      }
      if (log.activityType === 'SMS送信') {
        hasSms = true;
      }
      if (!lastActivityDate || log.activityDate > lastActivityDate) {
        lastActivityDate = log.activityDate;
      }
    }
  }

  const missingKinds: UsagePriorityKind[] = [];
  if (!hasCommunication) {
    missingKinds.push('communication');
  }
  if (!hasCall) {
    missingKinds.push('call');
  }
  if (!hasSms) {
    missingKinds.push('sms');
  }

  return {
    hasCommunication,
    hasCall,
    hasSms,
    lastActivityDate,
    missingKinds,
  };
}

function buildUsagePriorityLink(kind: UsagePriorityKind): string {
  const params = new URLSearchParams({
    sort: 'latestActivityAsc',
    contractActiveOnly: 'true',
    usagePriority: kind,
  });

  return `/lines?${params.toString()}`;
}

export function buildHistoryLink(phoneNumber: string, kind: LineEvent['kind']): string {
  const params = new URLSearchParams({
    quickActivity: phoneNumber,
    historyIntent: kind,
  });

  return `/lines/history?${params.toString()}`;
}

function createEventTitle(kind: LineEvent['kind'], label: string): string {
  switch (kind) {
    case 'safeExit':
      return '解約可能推奨日が近い回線';
    case 'contractEnd':
      return '契約終了が近い回線';
    case 'plannedAction':
      return '今後のアクション予定';
    case 'mnpDeadline':
      return 'MNP予約番号期限';
    case 'freeOptionDeadline':
      return '無料オプション期限';
    case 'benefitDeadline':
      return '特典期限';
    case 'fiberDebt':
      return '光回線の残債解消予定';
    case 'notificationTarget':
      return '次回確認日';
    case 'usageShortage':
      return `${label}の実績不足`;
    case 'inactiveLine':
      return '長期未活動';
  }

  return 'イベント';
}

function createSeverityForDays(daysUntil: number, urgentThreshold: number): EventSeverity {
  if (daysUntil <= 0) {
    return 'critical';
  }
  return daysUntil <= urgentThreshold ? 'warning' : 'watch';
}

function pushEvent(events: LineEvent[], event: LineEvent): void {
  events.push(event);
}

function getLineEventOrigin(kind: LineEvent['kind']): LineEventOrigin {
  switch (kind) {
    case 'usageShortage':
    case 'inactiveLine':
      return 'history';
    default:
      return 'line';
  }
}

export function buildLineEventFeed(
  drafts: LineDraft[],
  historyEntries: LineHistoryEntry[],
  today: Date = new Date(),
): LineEvent[] {
  const eventFeed: LineEvent[] = [];

  for (const draft of drafts) {
    const isActive = draft.status === '利用中' || draft.status === '解約予定';

    if (isActive && draft.contractStartDate) {
      const safeExitDate = calculateSafeExitDate(draft.contractStartDate, SAFE_EXIT_DAYS);
      if (safeExitDate) {
        const daysUntil = diffInDays(today, safeExitDate);
        if (daysUntil <= CONTRACT_END_ALERT_DAYS) {
          pushEvent(eventFeed, {
            id: `${draft.id}:safeExit`,
            kind: 'safeExit',
            severity: createSeverityForDays(daysUntil, CONTRACT_END_ALERT_DAYS),
            origin: getLineEventOrigin('safeExit'),
            title: createEventTitle('safeExit', ''),
            summary: draft.lineName,
            detail: `解約可能推奨日 ${formatDateLabel(safeExitDate)} / ${formatRelativeDayLabel(daysUntil)}`,
            meta: [draft.carrier, draft.status],
            draftId: draft.id,
            draftName: draft.lineName,
            phoneNumber: draft.phoneNumber,
            carrier: draft.carrier,
            status: draft.status,
            dueDateIso: formatDateIso(safeExitDate),
            dueDateLabel: formatDateLabel(safeExitDate),
            to: `/lines?openDraft=${encodeURIComponent(draft.id)}`,
            ctaLabel: '回線を開く',
            sortKey: daysUntil,
          });
        }
      }
    }

    if (draft.nextReviewDate) {
      const nextReviewDate = parseReviewDate(draft.nextReviewDate);
      if (nextReviewDate) {
        const daysUntil = diffInDays(today, nextReviewDate);
        if (daysUntil <= 7) {
          pushEvent(eventFeed, {
            id: `${draft.id}:notificationTarget`,
            kind: 'notificationTarget',
            severity: createSeverityForDays(daysUntil, 7),
            origin: getLineEventOrigin('notificationTarget'),
            title: '次回確認日',
            summary: draft.lineName,
            detail: `${formatDateLabel(nextReviewDate)} / ${formatRelativeDayLabel(daysUntil)}`,
            meta: [draft.carrier, draft.status],
            draftId: draft.id,
            draftName: draft.lineName,
            phoneNumber: draft.phoneNumber,
            carrier: draft.carrier,
            status: draft.status,
            dueDateIso: formatDateIso(nextReviewDate),
            dueDateLabel: formatDateLabel(nextReviewDate),
            to: `/lines?openDraft=${encodeURIComponent(draft.id)}`,
            ctaLabel: '回線を開く',
            sortKey: daysUntil,
          });
        }
      }
    }

    if (isActive && draft.contractEndDate) {
      const endDate = parseReviewDate(draft.contractEndDate);
      if (endDate) {
        const daysUntil = diffInDays(today, endDate);
        if (daysUntil <= CONTRACT_END_ALERT_DAYS) {
          pushEvent(eventFeed, {
            id: `${draft.id}:contractEnd`,
            kind: 'contractEnd',
            severity: createSeverityForDays(daysUntil, CONTRACT_END_ALERT_DAYS),
            origin: getLineEventOrigin('contractEnd'),
            title: createEventTitle('contractEnd', ''),
            summary: draft.lineName,
            detail: `契約終了日 ${formatDateLabel(endDate)} / ${formatRelativeDayLabel(daysUntil)}`,
            meta: [draft.carrier, draft.status],
            draftId: draft.id,
            draftName: draft.lineName,
            phoneNumber: draft.phoneNumber,
            carrier: draft.carrier,
            status: draft.status,
            dueDateIso: formatDateIso(endDate),
            dueDateLabel: formatDateLabel(endDate),
            to: `/lines?openDraft=${encodeURIComponent(draft.id)}`,
            ctaLabel: '回線を開く',
            sortKey: daysUntil,
          });
        }
      }
    }

    if (isActive && draft.plannedExitDate) {
      const plannedDate = parseReviewDate(draft.plannedExitDate);
      if (plannedDate) {
        const daysUntil = diffInDays(today, plannedDate);
        if (daysUntil <= PLANNED_ACTION_ALERT_DAYS) {
          pushEvent(eventFeed, {
            id: `${draft.id}:plannedAction`,
            kind: 'plannedAction',
            severity: createSeverityForDays(daysUntil, PLANNED_ACTION_ALERT_DAYS),
            origin: getLineEventOrigin('plannedAction'),
            title: createEventTitle('plannedAction', ''),
            summary: draft.lineName,
            detail: `予定種別 ${draft.plannedExitType || '未設定'} / ${formatDateLabel(plannedDate)} / ${formatRelativeDayLabel(daysUntil)}`,
            meta: [draft.plannedNextCarrier || '次キャリア未設定', draft.status],
            draftId: draft.id,
            draftName: draft.lineName,
            phoneNumber: draft.phoneNumber,
            carrier: draft.carrier,
            status: draft.status,
            dueDateIso: formatDateIso(plannedDate),
            dueDateLabel: formatDateLabel(plannedDate),
            to: `/lines?openDraft=${encodeURIComponent(draft.id)}`,
            ctaLabel: '回線を開く',
            sortKey: daysUntil,
          });
        }
      }
    }

    if (isActive && draft.mnpReservationNumber && draft.mnpReservationExpiry) {
      const expiryDate = parseReviewDate(draft.mnpReservationExpiry);
      if (expiryDate) {
        const daysUntil = diffInDays(today, expiryDate);
        if (daysUntil <= DEADLINE_ALERT_DAYS) {
          pushEvent(eventFeed, {
            id: `${draft.id}:mnpDeadline`,
            kind: 'mnpDeadline',
            severity: createSeverityForDays(daysUntil, DEADLINE_ALERT_DAYS),
            origin: getLineEventOrigin('mnpDeadline'),
            title: createEventTitle('mnpDeadline', ''),
            summary: draft.lineName,
            detail: `予約番号 ${draft.mnpReservationNumber} / ${formatDateLabel(expiryDate)} / ${formatRelativeDayLabel(daysUntil)}`,
            meta: [draft.carrier, draft.status],
            draftId: draft.id,
            draftName: draft.lineName,
            phoneNumber: draft.phoneNumber,
            carrier: draft.carrier,
            status: draft.status,
            dueDateIso: formatDateIso(expiryDate),
            dueDateLabel: formatDateLabel(expiryDate),
            to: `/lines?openDraft=${encodeURIComponent(draft.id)}`,
            ctaLabel: '回線を開く',
            sortKey: daysUntil,
          });
        }
      }
    }

    if (isActive && draft.freeOptionDeadline) {
      const freeOptionDate = parseReviewDate(draft.freeOptionDeadline);
      if (freeOptionDate) {
        const daysUntil = diffInDays(today, freeOptionDate);
        if (daysUntil <= DEADLINE_ALERT_DAYS) {
          pushEvent(eventFeed, {
            id: `${draft.id}:freeOptionDeadline`,
            kind: 'freeOptionDeadline',
            severity: createSeverityForDays(daysUntil, DEADLINE_ALERT_DAYS),
            origin: getLineEventOrigin('freeOptionDeadline'),
            title: createEventTitle('freeOptionDeadline', ''),
            summary: draft.lineName,
            detail: `${formatDateLabel(freeOptionDate)} / ${formatRelativeDayLabel(daysUntil)}`,
            meta: [draft.carrier, draft.status],
            draftId: draft.id,
            draftName: draft.lineName,
            phoneNumber: draft.phoneNumber,
            carrier: draft.carrier,
            status: draft.status,
            dueDateIso: formatDateIso(freeOptionDate),
            dueDateLabel: formatDateLabel(freeOptionDate),
            to: `/lines?openDraft=${encodeURIComponent(draft.id)}`,
            ctaLabel: '回線を開く',
            sortKey: daysUntil,
          });
        }
      }
    }

    for (const benefit of draft.benefits) {
      if (benefit.receivedFlag || !benefit.deadlineDate) {
        continue;
      }
      const deadlineDate = parseReviewDate(benefit.deadlineDate);
      if (!deadlineDate) {
        continue;
      }

      const daysUntil = diffInDays(today, deadlineDate);
      if (daysUntil > BENEFIT_ALERT_DAYS) {
        continue;
      }

      pushEvent(eventFeed, {
        id: `${draft.id}:benefit:${benefit.id}`,
        kind: 'benefitDeadline',
        severity: createSeverityForDays(daysUntil, BENEFIT_ALERT_DAYS),
        origin: getLineEventOrigin('benefitDeadline'),
        title: createEventTitle('benefitDeadline', ''),
        summary: draft.lineName,
        detail: `${benefit.benefitType} / ${benefit.condition || '受取条件未設定'} / ${formatDateLabel(deadlineDate)} / ${formatRelativeDayLabel(daysUntil)}`,
        meta: [formatDateLabel(deadlineDate), formatRelativeDayLabel(daysUntil)],
        draftId: draft.id,
        draftName: draft.lineName,
        phoneNumber: draft.phoneNumber,
        carrier: draft.carrier,
        status: draft.status,
        dueDateIso: formatDateIso(deadlineDate),
        dueDateLabel: formatDateLabel(deadlineDate),
        to: `/lines?openDraft=${encodeURIComponent(draft.id)}&focusSection=benefits`,
        ctaLabel: '特典を確認',
        sortKey: daysUntil,
      });
    }

    if (isActive && draft.lineType === '光回線') {
      const debtClearDate = calculateFiberDebtClearDate(draft.contractStartDate, draft.fiberConstructionFeeMonths);
      if (debtClearDate) {
        const daysUntil = diffInDays(today, debtClearDate);
        if (daysUntil <= FIBER_DEBT_ALERT_DAYS) {
          const remainingDebt = calculateFiberRemainingDebt(
            draft.contractStartDate,
            draft.fiberConstructionFee,
            draft.fiberMonthlyDiscount,
            draft.fiberConstructionFeeMonths,
            today,
          );
          pushEvent(eventFeed, {
            id: `${draft.id}:fiberDebt`,
            kind: 'fiberDebt',
            severity: createSeverityForDays(daysUntil, FIBER_DEBT_ALERT_DAYS),
            origin: getLineEventOrigin('fiberDebt'),
            title: createEventTitle('fiberDebt', ''),
            summary: draft.lineName,
            detail: `${formatDateLabel(debtClearDate)} / ${formatRelativeDayLabel(daysUntil)}${remainingDebt == null ? '' : ` / 残債 ${new Intl.NumberFormat('ja-JP').format(remainingDebt)}円`}`,
            meta: [draft.fiberIspName || draft.carrier, draft.status],
            draftId: draft.id,
            draftName: draft.lineName,
            phoneNumber: draft.phoneNumber,
            carrier: draft.carrier,
            status: draft.status,
            dueDateIso: formatDateIso(debtClearDate),
            dueDateLabel: formatDateLabel(debtClearDate),
            to: `/lines?openDraft=${encodeURIComponent(draft.id)}&focusSection=fiber`,
            ctaLabel: '光回線詳細を開く',
            sortKey: daysUntil,
          });
        }
      }
    }

    if (isActive) {
      const relatedEntries = findRelatedHistoryEntriesForDraft(draft, historyEntries);
      const usageSummary = buildUsageSummary(relatedEntries);
      const usageTargets: Array<{ kind: UsagePriorityKind; label: string; route: string }> = [
        { kind: 'communication', label: '通', route: buildUsagePriorityLink('communication') },
        { kind: 'call', label: '話', route: buildUsagePriorityLink('call') },
        { kind: 'sms', label: 'S', route: buildUsagePriorityLink('sms') },
      ];

      for (const target of usageTargets) {
        const hasUsage =
          target.kind === 'communication'
            ? usageSummary.hasCommunication
            : target.kind === 'call'
              ? usageSummary.hasCall
              : usageSummary.hasSms;

        if (hasUsage) {
          continue;
        }

        pushEvent(eventFeed, {
          id: `${draft.id}:usage:${target.kind}`,
          kind: 'usageShortage',
          severity: 'watch',
          origin: getLineEventOrigin('usageShortage'),
          title: `${target.label}不足`,
          summary: draft.lineName,
          detail: `直近 ${USAGE_SUMMARY_DAYS} 日の ${target.label} 実績がありません`,
          meta: [draft.carrier, usageSummary.lastActivityDate ? `最終活動 ${formatDateLabel(parseReviewDate(usageSummary.lastActivityDate) ?? today)}` : '記録なし'],
          draftId: draft.id,
          draftName: draft.lineName,
          phoneNumber: draft.phoneNumber,
          carrier: draft.carrier,
          status: draft.status,
          dueDateIso: usageSummary.lastActivityDate ?? null,
          dueDateLabel: usageSummary.lastActivityDate ? formatDateLabel(parseReviewDate(usageSummary.lastActivityDate) ?? today) : null,
          to: target.route,
          ctaLabel: '不足種別を確認',
          sortKey: usageSummary.lastActivityDate ? diffInDays(parseReviewDate(usageSummary.lastActivityDate) ?? today, today) : 9999,
        });
      }

      const latestActivityDate = getLatestActivityDateFromEntries(relatedEntries);
      if (!latestActivityDate) {
        pushEvent(eventFeed, {
          id: `${draft.id}:inactive`,
          kind: 'inactiveLine',
          severity: 'watch',
          origin: getLineEventOrigin('inactiveLine'),
          title: createEventTitle('inactiveLine', ''),
          summary: draft.lineName,
          detail: '活動記録がありません',
          meta: [draft.carrier, draft.status],
          draftId: draft.id,
          draftName: draft.lineName,
          phoneNumber: draft.phoneNumber,
          carrier: draft.carrier,
          status: draft.status,
          dueDateIso: null,
          dueDateLabel: null,
          to: draft.phoneNumber
            ? buildHistoryLink(draft.phoneNumber, 'inactiveLine')
            : '/lines?sort=latestActivityAsc',
          ctaLabel: draft.phoneNumber ? '活動を記録' : '履歴を確認',
          sortKey: 9999,
        });
      } else {
        const latestActivityDateObj = parseReviewDate(latestActivityDate);
        if (latestActivityDateObj) {
          const daysSinceActivity = diffInDays(latestActivityDateObj, today);
          if (daysSinceActivity >= INACTIVE_THRESHOLD_DAYS) {
            pushEvent(eventFeed, {
              id: `${draft.id}:inactive`,
              kind: 'inactiveLine',
              severity: 'watch',
              origin: getLineEventOrigin('inactiveLine'),
              title: createEventTitle('inactiveLine', ''),
              summary: draft.lineName,
              detail: `${formatDateLabel(latestActivityDateObj)} 以降の活動がありません`,
              meta: [draft.carrier, draft.status],
              draftId: draft.id,
              draftName: draft.lineName,
              phoneNumber: draft.phoneNumber,
              carrier: draft.carrier,
              status: draft.status,
              dueDateIso: formatDateIso(latestActivityDateObj),
              dueDateLabel: formatDateLabel(latestActivityDateObj),
              to: draft.phoneNumber
                ? buildHistoryLink(draft.phoneNumber, 'inactiveLine')
                : '/lines?sort=latestActivityAsc',
              ctaLabel: draft.phoneNumber ? '活動を記録' : '履歴を確認',
              sortKey: daysSinceActivity,
            });
          }
        }
      }
    }
  }

  return eventFeed.sort((a, b) => {
    const severityRank: Record<EventSeverity, number> = {
      critical: 0,
      warning: 1,
      watch: 2,
    };

    const severityDiff = severityRank[a.severity] - severityRank[b.severity];
    if (severityDiff !== 0) {
      return severityDiff;
    }

    if (a.sortKey !== b.sortKey) {
      return a.sortKey - b.sortKey;
    }

    if (a.draftName !== b.draftName) {
      return a.draftName.localeCompare(b.draftName, 'ja');
    }

    return a.title.localeCompare(b.title, 'ja');
  });
}

export function groupLineEventsBySeverity(events: LineEvent[]): LineEventGroup[] {
  const grouped = new Map<EventSeverity, LineEvent[]>();
  for (const severity of ['critical', 'warning', 'watch'] as const) {
    grouped.set(severity, []);
  }

  for (const event of events) {
    grouped.get(event.severity)?.push(event);
  }

  const groups: LineEventGroup[] = [
    {
      severity: 'critical',
      label: 'Critical',
      description: '期限超過と直近失効を優先的に処理する一覧です。',
      tone: 'danger',
      events: grouped.get('critical') ?? [],
    },
    {
      severity: 'warning',
      label: 'Warning',
      description: '30〜60日以内の予定と近づく解消タイミングを整理します。',
      tone: 'warn',
      events: grouped.get('warning') ?? [],
    },
    {
      severity: 'watch',
      label: 'Watch',
      description: '利用実績、通知対象、巡回対象をまとめます。',
      tone: 'info',
      events: grouped.get('watch') ?? [],
    },
  ];

  for (const group of groups) {
    group.events.sort((a, b) => {
      if (a.sortKey !== b.sortKey) {
        return a.sortKey - b.sortKey;
      }
      if (a.draftName !== b.draftName) {
        return a.draftName.localeCompare(b.draftName, 'ja');
      }
      return a.title.localeCompare(b.title, 'ja');
    });
  }

  return groups;
}

function getEventDueDate(event: LineEvent): Date | null {
  if (!event.dueDateIso) {
    return null;
  }

  return parseReviewDate(event.dueDateIso);
}

export function groupLineEventsByMonth(
  events: LineEvent[],
  today: Date = new Date(),
  options: { lookaheadDays?: number; overdueDays?: number } = {},
): LineEventMonthGroup[] {
  const lookaheadDays = options.lookaheadDays ?? 180;
  const overdueDays = options.overdueDays ?? 30;

  const lowerBound = startOfDay(today);
  lowerBound.setDate(lowerBound.getDate() - overdueDays);

  const upperBound = startOfDay(today);
  upperBound.setDate(upperBound.getDate() + lookaheadDays);

  const severityRank: Record<EventSeverity, number> = {
    critical: 0,
    warning: 1,
    watch: 2,
  };

  const datedEvents = events
    .map((event) => ({ event, dueDate: getEventDueDate(event) }))
    .filter((item): item is { event: LineEvent; dueDate: Date } => item.dueDate != null)
    .filter(({ dueDate }) => dueDate >= lowerBound && dueDate <= upperBound)
    .sort((a, b) => {
      const dueDateDiff = a.dueDate.getTime() - b.dueDate.getTime();
      if (dueDateDiff !== 0) {
        return dueDateDiff;
      }

      const severityDiff = severityRank[a.event.severity] - severityRank[b.event.severity];
      if (severityDiff !== 0) {
        return severityDiff;
      }

      if (a.event.draftName !== b.event.draftName) {
        return a.event.draftName.localeCompare(b.event.draftName, 'ja');
      }

      return a.event.title.localeCompare(b.event.title, 'ja');
    });

  const grouped = new Map<string, LineEventMonthGroup>();
  for (const item of datedEvents) {
    const monthKey = formatMonthKey(item.dueDate);
    const existing = grouped.get(monthKey);
    if (existing) {
      existing.events.push(item.event);
      continue;
    }

    grouped.set(monthKey, {
      monthKey,
      monthLabel: formatMonthLabel(item.dueDate),
      events: [item.event],
    });
  }

  return Array.from(grouped.values());
}
