
var gZenViewSplitter = {
  /**
   * [ 
   *   {
   *     tabs: [
   *      tab1,
   *      tab2,
   *      tab3,
   *     ],
   *    gridType: "vsep" | "hsep" | "grid",
   *   }
   * ]
   */
  _data: [],
  currentView: -1,

  init() {
    window.addEventListener("TabClose", this);
    this.initializeUI();
    console.log("ZenViewSplitter initialized");
  },

  initializeUI() {
    this.insertIntoContextMenu();
    this.initializeUpdateContextMenuItems();
    this.initializeTabContextMenu();
    this.initializeZenSplitBox();
  },

  initializeZenSplitBox() {
    const fragment = window.MozXULElement.parseXULToFragment(`
      <hbox id="zen-split-views-box"
          hidden="true"
          role="button"
          class="urlbar-page-action"
          onclick="gZenViewSplitter.openSplitViewPanel(event);">
        <image id="zen-split-views-button"
              class="urlbar-icon"/>
      </hbox>`);
    document.getElementById("star-button-box").after(fragment);
  },

  initializeTabContextMenu() {
    const fragment = window.MozXULElement.parseXULToFragment(`
      <menuseparator/>
      <menuitem id="context_zenSplitTabs"
                data-lazy-l10n-id="tab-zen-split-tabs"
                oncommand="gZenViewSplitter.contextSplitTabs();"/>
    `);
    document.getElementById("tabContextMenu").appendChild(fragment);
  },

  initializeUpdateContextMenuItems() {
    const contentAreaContextMenu = document.getElementById("tabContextMenu");
    contentAreaContextMenu.addEventListener("popupshowing", () => {
      const tabCountInfo = JSON.stringify({
        tabCount: window.gBrowser.selectedTabs.length,
      });
      document
        .getElementById("context_zenSplitTabs")
        .setAttribute("data-l10n-args", tabCountInfo);
      document.getElementById("context_zenSplitTabs").disabled =
        !this.contextCanSplitTabs();
    });
  },

  handleEvent(event) {
    switch (event.type) {
      case "TabClose":
        this.onTabClose(event);
    }
  },

  insertIntoContextMenu() {
    const sibling = document.getElementById("context-stripOnShareLink");
    const menuitem = document.createXULElement("menuitem");
    menuitem.setAttribute("id", "context-zenSplitLink");
    menuitem.setAttribute("hidden", "true");
    menuitem.setAttribute("oncommand", "gZenViewSplitter.contextSplitLink();");
    menuitem.setAttribute("data-l10n-id", "zen-split-link");
    const separator = document.createXULElement("menuseparator");
    sibling.insertAdjacentElement("afterend", menuitem);
    sibling.insertAdjacentElement("afterend", separator);
  },

  get tabBrowserPanel() {
    if (!this._tabBrowserPanel) {
      this._tabBrowserPanel = document.getElementById("tabbrowser-tabpanels");
    }
    return this._tabBrowserPanel;
  },

  onTabClose(event) {
    const tab = event.target;
    let index = this._data.findIndex((group) => group.tabs.includes(tab));
    if (index < 0) {
      return;
    }
    let dataTab = this._data[index].tabs;
    dataTab.splice(dataTab.indexOf(tab), 1);
    tab._zenSplitted = false;
    tab.linkedBrowser.zenModeActive = false;
    let container = tab.linkedBrowser.closest(".browserSidebarContainer");
    container.removeAttribute("zen-split");
    if (!event.forUnsplit) {
      tab.linkedBrowser.docShellIsActive = false;
      container.style.display = "none";         
    } else {
      container.style.gridArea = "1 / 1";
    }
    if (dataTab.length < 2) {
      this._data.splice(index, 1);
      if (this.currentView == index) {
        console.assert(dataTab.length == 1, "Data tab length is not 1");      
        this.currentView = -1;
        this.tabBrowserPanel.removeAttribute("zen-split-view");
        this.tabBrowserPanel.style.gridTemplateAreas = "";
        this.tabBrowserPanel.style.gridGap = "0px";
        for (const tab of dataTab) {
          let container = tab.linkedBrowser.closest(".browserSidebarContainer");
          container.removeAttribute("zen-split");
          container.style.gridArea = "1 / 1";
          tab._zenSplitted = false;               
        }     
      }
      return;
    }
    let lastTab = dataTab[dataTab.length - 1];
    this._showSplitView(lastTab);
  },

  contextSplitLink() {
    const url = gContextMenu.linkURL || gContextMenu.target.ownerDocument.location.href;
    const tab = gBrowser.selectedTab;
    const newTab = gZenUIManager.openAndChangeToTab(url);
    this.splitTabs([tab, newTab]);
  },

  onLocationChange(browser) {
    let tab = gBrowser.getTabForBrowser(browser);
    this.updateSplitViewButton(!(tab && tab._zenSplitted));
    if (!tab) {
      return;
    }

    this._showSplitView(tab);
  },

  splitTabs(tabs) {
    if (tabs.length < 2) {
      return;
    }
    // Check if any tab is already split
    for (const tab of tabs) {
      if (tab._zenSplitted) {
        let index = this._data.findIndex((group) => group.tabs.includes(tab));
        if (index < 0) {
          return;
        }
        this._showSplitView(tab);
        return;
      }
    }
    this._data.push({
      tabs,
      gridType: "grid",
    });
    gBrowser.selectedTab = tabs[0];
    this._showSplitView(tabs[0]);
  },

  _showSplitView(tab) {
    const splitData = this._data.find((group) => group.tabs.includes(tab));
    function modifyDecks(tabs, add) {
      for (const tab of tabs) {
        tab.linkedBrowser.zenModeActive = add;
        tab.linkedBrowser.docShellIsActive = add;
        let browser = tab.linkedBrowser.closest(".browserSidebarContainer");
        if (add) {
          browser.setAttribute("zen-split", "true");
          continue;
        }
        browser.removeAttribute("zen-split");
      }
    }
    const handleClick = (tab) => {
      return ((event) => {
        gBrowser.selectedTab = tab;
      })
    };    
    if (!splitData || (this.currentView >= 0 && !this._data[this.currentView].tabs.includes(tab))) {
      this.updateSplitViewButton(true);
      if (this.currentView < 0) {
        return;
      }
      for (const tab of this._data[this.currentView].tabs) {
        //tab._zenSplitted = false;
        let container = tab.linkedBrowser.closest(".browserSidebarContainer");
        container.removeAttribute("zen-split-active");
        container.classList.remove("deck-selected");
        console.assert(container, "No container found for tab");
        container.removeEventListener("click", handleClick(tab));
        container.style.gridArea = "";
      }
      this.tabBrowserPanel.removeAttribute("zen-split-view");
      this.tabBrowserPanel.style.gridTemplateAreas = "";
      modifyDecks(this._data[this.currentView].tabs, false);
      // console.log("Setting the active tab to be active", gBrowser.selectedTab);
      gBrowser.selectedTab.linkedBrowser.docShellIsActive = true; // Make sure the active tab is active
      this.currentView = -1;
      if (!splitData) {
        return;
      }
    }
    this.tabBrowserPanel.setAttribute("zen-split-view", "true");
    this.currentView = this._data.indexOf(splitData);
    let gridType = splitData.gridType || "grid"; // TODO: let user decide the grid type
    let i = 0;
    // 2 rows, infinite columns
    let currentRowGridArea = ["", ""/* first row, second row */];
    let numberOfRows = 0;
    for (const _tab of splitData.tabs) {
      _tab._zenSplitted = true;
      let container = _tab.linkedBrowser.closest(".browserSidebarContainer");
      console.assert(container, "No container found for tab");
      container.removeAttribute("zen-split-active");
      if (_tab == tab) {
        container.setAttribute("zen-split-active", "true");
      }
      container.setAttribute("zen-split-anim", "true");
      container.addEventListener("click", handleClick(_tab));
      // Set the grid type for the container. If the grid type is not "grid", then set the grid type contain 
      // each column or row. If it's "grid", then try to create
      if (gridType == "grid") {
        // Each 2 tabs, create a new row
        if (i % 2 == 0) {
          currentRowGridArea[0] += ` tab${i + 1}`;
        } else {
          currentRowGridArea[1] += ` tab${i + 1}`;
          numberOfRows++;
        }
        container.style.gridArea = `tab${i + 1}`;
      }  
      i++;
    }
    if (gridType == "grid") {
      if ((numberOfRows < splitData.tabs.length / 2) && (splitData.tabs.length != 2)) { 
        // Make the last tab occupy the last row
        currentRowGridArea[1] += ` tab${i}`;
      }
      if (gridType == "grid" && (splitData.tabs.length === 2)) {
        currentRowGridArea[0]     = `tab1 tab2`;
        currentRowGridArea[1] = "";
      }     
      this.tabBrowserPanel.style.gridTemplateAreas = `'${currentRowGridArea[0]}'`;
      if (currentRowGridArea[1] != "") {
        this.tabBrowserPanel.style.gridTemplateAreas += `     '${currentRowGridArea[1]}'`;
      }
    } else if (gridType == "vsep") {
      this.tabBrowserPanel.style.gridTemplateAreas = `'${splitData.tabs.map((_, i) => `tab${i + 1}`).join(" ")}'`;
    } else if (gridType == "hsep") {
      this.tabBrowserPanel.style.gridTemplateAreas = `${splitData.tabs.map((_, i) => `'tab${i + 1}'`).join(" ")}`;
    }
    modifyDecks(splitData.tabs, true);
    this.updateSplitViewButton(false);
  },

  contextSplitTabs() {
    let tabs = gBrowser.selectedTabs;
    this.splitTabs(tabs);
  },

  contextCanSplitTabs() {
    if (gBrowser.selectedTabs.length < 2) {
      return false;
    }
    // Check if any tab is already split
    for (const tab of gBrowser.selectedTabs) {
      if (tab._zenSplitted) {
        return false;
      }
    }
    return true;
  },

  // Panel and url button

  updateSplitViewButton(hidden) {
    let button = document.getElementById("zen-split-views-box");
    if (hidden) {
      button.setAttribute("hidden", "true");
      return;
    }
    button.removeAttribute("hidden");
  },

  get _modifierElement() {
    if (!this.__modifierElement) {
      let wrapper = document.getElementById("template-zen-split-view-modifier");
      const panel = wrapper.content.firstElementChild;
      wrapper.replaceWith(wrapper.content);
      this.__modifierElement = panel;
    }
    return this.__modifierElement;
  },

  async openSplitViewPanel(event) {
    let panel = this._modifierElement;
    let target = event.target.parentNode;
    for (const gridType of ["hsep", "vsep", "grid", "unsplit"]) {
      let selector = panel.querySelector(`.zen-split-view-modifier-preview.${gridType}`);
      selector.classList.remove("active");
      if (this.currentView >= 0 && this._data[this.currentView].gridType == gridType) {
        selector.classList.add("active");
      }
      if (this.__hasSetMenuListener) {
        continue;
      }
      selector.addEventListener("click", ((gridType) => {
        if (gridType === "unsplit") {
          let currentTab = gBrowser.selectedTab;
          let tabs = this._data[this.currentView].tabs;
          for (const tab of tabs) {
            this.onTabClose({ target: tab, forUnsplit: true });
          }
          gBrowser.selectedTab = currentTab;
          panel.hidePopup();
          this.updateSplitViewButton(true);
          return;
        }
        this._data[this.currentView].gridType = gridType;
        this._showSplitView(gBrowser.selectedTab);
        // panel.hidePopup();
      }).bind(this, gridType));
    } 
    this.__hasSetMenuListener = true;
    PanelMultiView.openPopup(panel, target, {
      position: "bottomright topright",
      triggerEvent: event,
    }).catch(console.error);
  },
};

gZenViewSplitter.init();