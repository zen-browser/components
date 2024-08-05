import { Config } from "../common/config";

export type SplitType = 'horizontal' | 'vertical' | 'grid';

export interface SplitViewConfig extends Config {
  keyIndicator: string; // e.g. "split-tab='true'"
  defaultSplitView: SplitType;
};

export type Tab = HTMLDivElement;

export interface SplitView {
  type: SplitType;
  tabs: Tab[];
};
