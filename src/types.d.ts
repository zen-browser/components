import { Config } from "./common";

export type SplitType = 'horizontal' | 'vertical' | 'grid';

export interface SplitViewConfig {
  keyIndicator: string; // e.g. "split-tab='true'"
  defaultSplitView: SplitType;
};

export interface SplitView {
  type: SplitType;
  tabs: MockedExports.BrowserTab[];
};
