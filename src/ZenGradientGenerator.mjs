
{
  class ZenThemePicker extends ZenDOMOperatedFeature {
    init() {
      this.initContextMenu();
    }

    initContextMenu() {
      const menu = window.MozXULElement.parseXULToFragment(`
        <menuitem id="zenToolbarThemePicker"
                  data-lazy-l10n-id="zen-workspaces-change-gradient"
                  oncommand="gZenThemePicker.openThemePicker(event);"/>
      `);
      document.getElementById('toolbar-context-customize').before(menu);
    }
  }

  window.ZenThemePicker = new ZenThemePicker();
}
