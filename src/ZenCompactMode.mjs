var gZenCompactModeManager = {
  _flashSidebarTimeout: null,

  init() {
    Services.prefs.addObserver('zen.view.compact', this._updateEvent.bind(this));
    Services.prefs.addObserver('zen.view.compact.toolbar-flash-popup.duration', this._updatedSidebarFlashDuration.bind(this));

    gZenUIManager.addPopupTrackingAttribute(this.sidebar);
    gZenUIManager.addPopupTrackingAttribute(document.getElementById('zen-appcontent-navbar-container'));
  },

  get prefefence() {
    return Services.prefs.getBoolPref('zen.view.compact');
  },

  set preference(value) {
    Services.prefs.setBoolPref('zen.view.compact', value);
  },

  get sidebar() {
    if (!this._sidebar) {
      this._sidebar= document.getElementById('navigator-toolbox');
    }
    return this._sidebar;
  },

  _updateEvent() {
    Services.prefs.setBoolPref('zen.view.sidebar-expanded.on-hover', false);
  },

  toggle() {
    this.preference = !this.prefefence;
  },

  _updatedSidebarFlashDuration() {
    this._flashSidebarDuration = Services.prefs.getIntPref('zen.view.compact.toolbar-flash-popup.duration');
  },

  toggleSidebar() {
    this.sidebar.toggleAttribute('zen-user-show');
  },

  get flashSidebarDuration() {
    if (this._flashSidebarDuration) {
      return this._flashSidebarDuration;
    }
    return Services.prefs.getIntPref('zen.view.compact.toolbar-flash-popup.duration');
  },

  flashSidebar() {
    let tabPanels = document.getElementById('tabbrowser-tabpanels');
    if (this.sidebar.matches(':hover') || tabPanels.matches("[zen-split-view='true']")) {
      return;
    }
    if (this._flashSidebarTimeout) {
      clearTimeout(this._flashSidebarTimeout);
    } else {
      window.requestAnimationFrame(() => this.sidebar.setAttribute('flash-popup', ''));
    }
    this._flashSidebarTimeout = setTimeout(() => {
      window.requestAnimationFrame(() => {
        this.sidebar.removeAttribute('flash-popup');
        this._flashSidebarTimeout = null;
      });
    }, this.flashSidebarDuration);
  },

  toggleToolbar() {
    let toolbar = document.getElementById('zen-appcontent-navbar-container');
    toolbar.toggleAttribute('zen-user-show');
  },
};