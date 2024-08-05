
import Component from '../common/component';
import { SplitViewConfig, SplitView } from './types';

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

  addEventListeners() {
    // Add event listeners here like TabClose, TabOpen, etc.
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


};
