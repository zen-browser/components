var gZenCompactModeManager = {
  _flashSidebarTimeout: {},
  _evenListeners: [],

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

  addEventListener(callback) {
    this._evenListeners.push(callback);
  },

  _updateEvent() {
    this._evenListeners.forEach((callback) => callback());
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
      document.getElementById('zen-appcontent-navbar-container'),
      this.sidebar,
    ];
  },

  flashSidebar(element = null, duration = null, id = null, forFlash = true) {
    if (!element) {
      element = this.sidebar;
    }
    if (!duration) {
      duration = this.flashSidebarDuration;
    }
    if (!id) {
      id = this.sidebar.id;
    }
    let tabPanels = document.getElementById('tabbrowser-tabpanels');
    if (element.matches(':hover') || (forFlash && tabPanels.matches("[zen-split-view='true']"))) {
      return;
    }
    if (this._flashSidebarTimeout[id]) {
      clearTimeout(this._flashSidebarTimeout[id]);
    } else if (forFlash) {
      window.requestAnimationFrame(() => element.setAttribute('flash-popup', ''));
    } else {
      window.requestAnimationFrame(() => element.setAttribute('zen-has-hover', 'true'));
    }
    this._flashSidebarTimeout[id] = setTimeout(() => {
      window.requestAnimationFrame(() => {
        if (forFlash) {
          element.removeAttribute('flash-popup');
        } else {
          element.removeAttribute('zen-has-hover');
        }
        this._flashSidebarTimeout[id] = null;
      });
    }, duration);
  },

  addMouseActions() {
    for (let i = 0; i < this.hoverableElements.length; i++) {
      this.hoverableElements[i].addEventListener('mouseenter', (event) => {
        let target = this.hoverableElements[i];
        target.setAttribute('zen-has-hover', 'true');
      });

      this.hoverableElements[i].addEventListener('mouseleave', (event) => {
        let target = this.hoverableElements[i];
        this.flashSidebar(target, this.hideAfterHoverDuration, target.id, false);
      });
    }
  },

  toggleToolbar() {
    let toolbar = document.getElementById('zen-appcontent-navbar-container');
    toolbar.toggleAttribute('zen-user-show');
  },
};