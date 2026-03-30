import sampleData from '../../test-data.json';
import { lineDraftStore, type LineDraft } from './lineDrafts';
import { lineHistoryStore, type LineHistoryEntry } from './lineHistory';

type SampleDataBundle = {
  lineDrafts: unknown;
  lineHistory: unknown;
};

export type SampleDataImportResult = {
  drafts: LineDraft[];
  historyEntries: LineHistoryEntry[];
  draftCount: number;
  historyCount: number;
};

export function importBundledSampleData(): SampleDataImportResult {
  const bundle = sampleData as SampleDataBundle;
  const drafts = lineDraftStore.importJson(JSON.stringify(bundle.lineDrafts));
  const historyEntries = lineHistoryStore.importJson(JSON.stringify(bundle.lineHistory));

  return {
    drafts,
    historyEntries,
    draftCount: drafts.length,
    historyCount: historyEntries.length,
  };
}
