
const lazyCompactMode = {};

XPCOMUtils.defineLazyPreferenceGetter(
  lazyCompactMode,
  "COMPACT_MODE_FLASH_DURATION",
  "zen.view.compact.toolbar-flash-popup.duration",
  800
);

var gZenCompactModeManager = {
  _flashSidebarTimeout: {},
  _evenListeners: [],

  init() {
    Services.prefs.addObserver('zen.view.compact', this._updateEvent.bind(this));

    gZenUIManager.addPopupTrackingAttribute(this.sidebar);
    gZenUIManager.addPopupTrackingAttribute(document.getElementById('zen-appcontent-navbar-container'));

    this.addMouseActions();
    this.addContextMenu();
  },

  get prefefence() {
    return Services.prefs.getBoolPref('zen.view.compact');
  },

  set preference(value) {
    Services.prefs.setBoolPref('zen.view.compact', value);
    return value;
  },

  get sidebar() {
    if (!this._sidebar) {
      this._sidebar= document.getElementById('navigator-toolbox');
    }
    return this._sidebar;
  },

  addContextMenu() {
    const compactModeActive = Services.prefs.getBoolPref('zen.view.compact');
    const compactModeSidebar = Services.prefs.getBoolPref('zen.view.compact.hide-tabbar');
    const compactModeToolbar = Services.prefs.getBoolPref('zen.view.compact.hide-toolbar');
    const compactModeBoth = compactModeSidebar && compactModeToolbar;
    const fragment = window.MozXULElement.parseXULToFragment(`
      <menu id="zen-context-menu-compact-mode" data-l10n-id="zen-toolbar-context-compact-mode">
        <menupopup>
          <menuitem checked="${compactModeActive}" id="zen-context-menu-compact-mode-toggle" data-l10n-id="zen-toolbar-context-compact-mode-enable" type="checkbox" oncommand="gZenCompactModeManager.contextMenuToggle();"/>
          <menuseparator/>
          <menuitem checked="${!compactModeBoth && compactModeSidebar}" id="zen-context-menu-compact-mode-hide-sidebar" data-l10n-id="zen-toolbar-context-compact-mode-just-tabs" type="radio" oncommand="gZenCompactModeManager.contextMenuHideSidebar();"/>
          <menuitem checked="${!compactModeBoth && compactModeToolbar}" id="zen-context-menu-compact-mode-hide-toolbar" data-l10n-id="zen-toolbar-context-compact-mode-just-toolbar" type="radio" oncommand="gZenCompactModeManager.contextMenuHideToolbar();"/>
          <menuitem checked="${compactModeBoth}" id="zen-context-menu-compact-mode-hide-both" data-l10n-id="zen-toolbar-context-compact-mode-hide-both" type="radio" oncommand="gZenCompactModeManager.contextMenuHideBoth();"/>
        </menupopup>
      </menu>
    `);
    document.getElementById('viewToolbarsMenuSeparator').before(fragment);
  },

  contextMenuToggle() {
    document.getElementById('zen-context-menu-compact-mode-toggle')
      .setAttribute('checked', this.toggle());
  },

  contextMenuHideSidebar() {
    Services.prefs.setBoolPref('zen.view.compact.hide-tabbar', true);
    Services.prefs.setBoolPref('zen.view.compact.hide-toolbar', false);
    document.getElementById('zen-context-menu-compact-mode-hide-sidebar')
      .setAttribute('checked', true);
    document.getElementById('zen-context-menu-compact-mode-hide-toolbar')
      .setAttribute('checked', false);
    document.getElementById('zen-context-menu-compact-mode-hide-both')
      .setAttribute('checked', false);
  },

  contextMenuHideToolbar() {
    Services.prefs.setBoolPref('zen.view.compact.hide-toolbar', true);
    Services.prefs.setBoolPref('zen.view.compact.hide-tabbar', false);
    document.getElementById('zen-context-menu-compact-mode-hide-sidebar')
      .setAttribute('checked', false);
    document.getElementById('zen-context-menu-compact-mode-hide-toolbar')
      .setAttribute('checked', true);
    document.getElementById('zen-context-menu-compact-mode-hide-both')
      .setAttribute('checked', false);
  },

  contextMenuHideBoth() {
    Services.prefs.setBoolPref('zen.view.compact.hide-tabbar', true);
    Services.prefs.setBoolPref('zen.view.compact.hide-toolbar', true);
    document.getElementById('zen-context-menu-compact-mode-hide-sidebar')
      .setAttribute('checked', false);
    document.getElementById('zen-context-menu-compact-mode-hide-toolbar')
      .setAttribute('checked', false);
    document.getElementById('zen-context-menu-compact-mode-hide-both')
      .setAttribute('checked', true);
  },

  addEventListener(callback) {
    this._evenListeners.push(callback);
  },

  _updateEvent() {
    this._evenListeners.forEach((callback) => callback());
    Services.prefs.setBoolPref('zen.view.sidebar-expanded.on-hover', false);
  },

  toggle() {
    return this.preference = !this.prefefence;
  },

  toggleSidebar() {
    this.sidebar.toggleAttribute('zen-user-show');
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
      duration = lazyCompactMode.COMPACT_MODE_FLASH_DURATION;
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