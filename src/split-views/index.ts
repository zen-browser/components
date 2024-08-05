
import Component from '../common/component';
import { SplitViewConfig, SplitView, SplitType } from './types';

class SplitViewsBase extends Component {
  data: SplitView[];
  currentView: number;

  constructor(config: SplitViewConfig) {
    super(config);
    this.data = [];
    this.currentView = -1;
    this.addEventListeners();
    this.log('SplitViewsBase initialized');
  }

  get viewConfig() {
    return this.config as SplitViewConfig;
  }

  addEventListeners() {
    window.addEventListener('TabClose', this);
  }

  handleEvent(event: Event) {
    switch (event.type) {
      case 'TabClose':
        this.onTabClose(event as CustomEvent);
        break;
    }
  }

  onTabClose(event: CustomEvent) {
  }

  public get isActivated() {
    return this.currentView !== -1;
  }

  get activeView() {
    if (!this.isActivated) {
      throw new Error('No active view');
    }
    return this.data[this.currentView];
  }
}

// Public API exposed by the module
export class gSplitViews extends SplitViewsBase {
  constructor(config: SplitViewConfig) {
    super(config);
  }

  public onLocationChange(browser: MockedExports.Browser) {
    this.log('onLocationChange');
  }

  public tileCurrentView(type: SplitType) {
    this.log('tileCurrentView');
  }

  public closeCurrentView() {
    this.log('closeCurrentView');
  }

  public tabIsInActiveView(tab: MockedExports.BrowserTab) {
    this.log('tabIsInActiveView');
    return false;
  }

  public getActiveViewTabs() {
    this.log('getActiveViewTabs');
    return [];
  }

  public createSplitView(tabs: MockedExports.BrowserTab[], type: SplitType = this.viewConfig.defaultSplitView) {
    this.log('createSplitView');
  }
};
