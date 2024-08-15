
const kZenThemesPreference = "zen.themes.data"; 
export class ZenThemeMarketplaceParent extends JSWindowActorParent {
  constructor() {
    super();

    Services.prefs.addObserver(kZenThemesPreference, this.onThemePreferenceChange.bind(this));
  }

  receiveMessage(message) {
    switch (message.name) {
      case "ZenThemeMarketplace:UpdateThemes": {
        console.info("ZenThemeMarketplaceParent: Updating themes");
        this.updateThemes(message.data.themes);
        break;
      }
    }
  }

  get themes() {
    if (!this._themes) {
      this._themes = JSON.parse(Services.prefs.getStringPref(kZenThemesPreference, "{}"));
    }
    return this._themes;
  }

  updateThemes(themes) {
    Services.prefs.setStringPref(kZenThemesPreference, JSON.stringify(themes));
  }

  onThemePreferenceChange() {
    this._themes = null;
    this.checkForThemeChanges();
  }

  async getDownloadFileContents(themeId) {
    try {
      const theme = this.themes[themeId];
      if (!theme) {
        throw new Error("Theme not found");
      }
      const downloadUrl = theme.downloadUrl;
      console.info("ZenThemeMarketplaceParent: Downloading file from ", downloadUrl);
      const response = await fetch(downloadUrl);
      const data = await response.text();
      return data;
    } catch (e) {
      console.error("ZenThemeMarketplaceParent: Error getting downloadable file", e);
      return "";
    }
  }

  get themesRootPath() {
    return PathUtils.join(
      PathUtils.profileDir,
      "chrome",
      "zen-themes"
    );
  }

  // Compare the downloaded themes to the "installed" themes
  // and update the installed themes with the new ones. We may also
  // delete any themes that are no longer available.
  async checkForThemeChanges() {
    
  }
};
