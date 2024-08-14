
export class ZenThemeMarketplaceChild extends JSWindowActorChild {
  constructor() {
    super();
  }

  handleEvent(event) {
    switch (event.type) {
      case "DOMContentLoaded":
        this.initiateThemeMarketplace();
        break;
      default:
    }
  }

  initiateThemeMarketplace() {
  }

  addIntallButton() {
    const actionsContainer = this.contentWindow.document.getElementById("theme-actions");
    if (!actionsContainer) {
      console.error("ZenThemeMarketplaceChild: Could not find theme-actions container");
      return;
    }
  }
};
