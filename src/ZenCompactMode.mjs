
const lazyCompactMode = {};

XPCOMUtils.defineLazyPreferenceGetter(
  lazyCompactMode,
  "COMPACT_MODE_FLASH_DURATION",
  "zen.view.compact.toolbar-flash-popup.duration",
  800
);

var gZenCompactModeManager = {
  _flashTimeouts: {},
  _evenListeners: [],

  init() {
    Services.prefs.addObserver('zen.view.compact', this._updateEvent.bind(this));
    Services.prefs.addObserver('zen.tabs.vertical.right-side', this._updateSidebarIsOnRight.bind(this));

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

  get sidebarIsOnRight() {
    if (this._sidebarIsOnRight) {
      return this._sidebarIsOnRight;
    }
    return Services.prefs.getBoolPref('zen.tabs.vertical.right-side');
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

  _updateSidebarIsOnRight() {
    this._sidebarIsOnRight = Services.prefs.getBoolPref('zen.tabs.vertical.right-side');
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
      {
        element: this.sidebar,
        screenEdge: this.sidebarIsOnRight ? "right" : "left",
      },
      {
        element: document.getElementById('zen-appcontent-navbar-container'),
        screenEdge:"top",
      }
    ];
  },

  flashSidebar(duration = this.flashSidebarDuration) {
    let tabPanels = document.getElementById('tabbrowser-tabpanels');
    if (!tabPanels.matches("[zen-split-view='true']")) {
      this.flashElement(this.sidebar, duration, this.sidebar.id);
    }
  },

  flashElement(element, duration, id, attrName = 'flash-popup') {
    if (element.matches(':hover')) {
      return;
    }
    if (this._flashTimeouts[id]) {
      clearTimeout(this._flashTimeouts[id]);
    } else {
      requestAnimationFrame(() => element.setAttribute(attrName, 'true'));
    }
    this._flashTimeouts[id] = setTimeout(() => {
      window.requestAnimationFrame(() => {
        element.removeAttribute(attrName);
        this._flashTimeouts[id] = null;
      });
    }, duration);
  },

  clearFlashTimeout(id) {
    clearTimeout(this._flashTimeouts[id]);
    this._flashTimeouts[id] = null;
  },

  addMouseActions() {
    for (let i = 0; i < this.hoverableElements.length; i++) {
      let target = this.hoverableElements[i].element;
      target.addEventListener('mouseenter', (event) => {
        this.clearFlashTimeout('has-hover' + target.id);
        target.setAttribute('zen-has-hover', 'true');
      });

      target.addEventListener('mouseleave', (event) => {
        if (this.hoverableElements[i].keepHoverDuration) {
          this.flashElement(target, keepHoverDuration, "has-hover" + target.id, 'zen-has-hover');
        } else {
          target.removeAttribute('zen-has-hover');
        }
      });
    }

    document.documentElement.addEventListener('mouseleave', (event) => {
      const screenEdgeCrossed = this._getCrossedEdge(event.pageX, event.pageY);
      if (!screenEdgeCrossed) return;
      for (let entry of this.hoverableElements) {
        if (screenEdgeCrossed !== entry.screenEdge) continue;
        const target = entry.element;
        const boundAxis = (entry.screenEdge === "right" || entry.screenEdge === "left" ? "y" : "x");
        if (!this._positionInBounds(boundAxis, target, event.pageX, event.pageY, 7)) {
          continue;
        }
        this.flashElement(target, this.hideAfterHoverDuration, "has-hover" + target.id, 'zen-has-hover');
        document.addEventListener('mousemove', () => {
          if (target.matches(':hover')) return;
          target.removeAttribute('zen-has-hover');
          this.clearFlashTimeout('has-hover' + target.id);
        }, {once: true});
      }
    });
  },

  _getCrossedEdge(posX, posY, element = document.documentElement, maxDistance = 10) {
    posX = Math.max(0, posX);
    posY = Math.max(0, posY);
    const targetBox = element.getBoundingClientRect();
    return ["top", "bottom", "left", "right"].find((edge, i) => {
      const distance = Math.abs((i < 2 ? posY : posX) - targetBox[edge]);
      return distance <= maxDistance;
    });
  },

  _positionInBounds(axis = "x", element, x, y, error = 0) {
    const bBox = element.getBoundingClientRect();
    if (axis === "y") return bBox.top - error < y && y < bBox.bottom + error;
    else return bBox.left - error < x && x < bBox.right + error;
  },

  toggleToolbar() {
    let toolbar = document.getElementById('zen-appcontent-navbar-container');
    toolbar.toggleAttribute('zen-user-show');
  },
};