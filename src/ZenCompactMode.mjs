var gZenCompactModeManager = {
  _flashSidebarTimeout: null,

  init() {
    Services.prefs.addObserver('zen.view.compact', this._updateEvent.bind(this));
    Services.prefs.addObserver('zen.view.compact.toolbar-flash-popup.duration', this._updatedSidebarFlashDuration.bind(this));

    gZenUIManager.addPopupTrackingAttribute(this.sidebar);
    gZenUIManager.addPopupTrackingAttribute(document.getElementById('zen-appcontent-navbar-container'));

    this.addMouseActions();
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

  get hideAfterHoverDuration() {
    if (this._hideAfterHoverDuration) {
      return this._hideAfterHoverDuration;
    }
    return Services.prefs.getIntPref('zen.view.compact.toolbar-hide-after-hover.duration');
  },

  get hoverableElements() {
    return [
      this.sidebar,
      document.getElementById('zen-appcontent-navbar-container'),
    ];
  },

  flashSidebar(element = null, duration = null) {
    if (!element) {
      element = this.sidebar;
    }
    if (!duration) {
      duration = this.flashSidebarDuration;
    }
    let tabPanels = document.getElementById('tabbrowser-tabpanels');
    if (element.matches(':hover') || tabPanels.matches("[zen-split-view='true']")) {
      return;
    }
    if (this._flashSidebarTimeout) {
      clearTimeout(this._flashSidebarTimeout);
    } else {
      window.requestAnimationFrame(() => element.setAttribute('flash-popup', ''));
    }
    this._flashSidebarTimeout = setTimeout(() => {
      window.requestAnimationFrame(() => {
        element.removeAttribute('flash-popup');
        this._flashSidebarTimeout = null;
      });
    }, duration);
  },

  addMouseActions() {
    for (let i = 0; i < this.hoverableElements.length; i++) {
      this.hoverableElements[i].addEventListener('mouseenter', (event) => {
        let target = this.hoverableElements[i];
        target.setAttribute('zen-user-hover', 'true');
      });

      this.hoverableElements[i].addEventListener('mouseleave', (event) => {
        let target = this.hoverableElements[i];
        this.flashSidebar(target, this.hideAfterHoverDuration);
      });
    }
  },

  toggleToolbar() {
    let toolbar = document.getElementById('zen-appcontent-navbar-container');
    toolbar.toggleAttribute('zen-user-show');
  },
};