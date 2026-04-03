import sampleData from '../../test-data.json';
import { lineDraftStore, type LineDraft } from './lineDrafts';
import { lineHistoryStore, type LineHistoryEntry } from './lineHistory';

type SampleDataBundle = {
  lineDrafts: {
    items: Array<Record<string, unknown>>;
    [key: string]: unknown;
  };
  lineHistory: Array<Record<string, unknown>>;
};

export type SampleDataImportResult = {
  drafts: LineDraft[];
  historyEntries: LineHistoryEntry[];
  draftCount: number;
  historyCount: number;
};

function formatLocalDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(value: Date, amount: number): string {
  const next = new Date(value);
  next.setDate(next.getDate() + amount);
  return formatLocalDate(next);
}

function cloneBundle(bundle: SampleDataBundle): SampleDataBundle {
  return JSON.parse(JSON.stringify(bundle)) as SampleDataBundle;
}

function getDraftItem(bundle: SampleDataBundle, id: string): Record<string, unknown> | null {
  const item = bundle.lineDrafts.items.find((entry) => String(entry.id ?? '') === id);
  return item ?? null;
}

function applyFixtureAdjustments(bundle: SampleDataBundle): SampleDataBundle {
  const adjusted = cloneBundle(bundle);
  const today = new Date();

  const benefitDraft = getDraftItem(adjusted, 'd-003');
  const benefitEntries = benefitDraft?.benefits;
  if (benefitDraft && Array.isArray(benefitEntries) && benefitEntries[0] && typeof benefitEntries[0] === 'object') {
    (benefitEntries[0] as Record<string, unknown>).deadlineDate = addDays(today, 2);
  }

  const deadlineDraft = getDraftItem(adjusted, 'd-017');
  if (deadlineDraft) {
    deadlineDraft.mnpReservationNumber = '1234567';
    deadlineDraft.mnpReservationExpiry = addDays(today, 2);
    deadlineDraft.freeOptionDeadline = addDays(today, -1);
  }

  const plannedActionDraft = getDraftItem(adjusted, 'd-025');
  if (plannedActionDraft) {
    plannedActionDraft.plannedExitDate = addDays(today, 15);
    plannedActionDraft.plannedExitType = 'MNP転出';
    plannedActionDraft.plannedNextCarrier = 'povo';
  }

  return adjusted;
}

export function importBundledSampleData(): SampleDataImportResult {
  const bundle = applyFixtureAdjustments(sampleData as SampleDataBundle);
  const drafts = lineDraftStore.importJson(JSON.stringify(bundle.lineDrafts));
  const historyEntries = lineHistoryStore.importJson(JSON.stringify(bundle.lineHistory));

  return {
    drafts,
    historyEntries,
    draftCount: drafts.length,
    historyCount: historyEntries.length,
  };
}
