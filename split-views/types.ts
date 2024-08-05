
type SplitType = 'horizontal' | 'vertical' | 'grid';

interface Config {
  keyIndicator: string; // e.g. "split-tab='true'"
  defaultSplitView: SplitType;
};

type Tab = any;

interface SplitView {
  type: SplitType;
  tabs: Tab[];
};
