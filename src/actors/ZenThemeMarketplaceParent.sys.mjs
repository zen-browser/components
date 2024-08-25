
export class ZenThemeMarketplaceParent extends JSWindowActorParent {
  constructor() {
    super();
  }

  async receiveMessage(message) {
    switch (message.name) {
      case "ZenThemeMarketplace:InstallTheme": {
        console.info("ZenThemeMarketplaceParent: Updating themes");
        const theme = message.data.theme;
        const themes = await this.getThemes();
        themes[theme.id] = theme;
        this.updateThemes(themes);
        this.updateChildProcesses(theme.id);
        break;
      }
      case "ZenThemeMarketplace:UninstallTheme": {
        console.info("ZenThemeMarketplaceParent: Uninstalling theme");
        const themeId = message.data.themeId;
        const themes = await this.getThemes();
        delete themes[themeId];
        this.removeTheme(themeId);
        this.updateThemes(themes);
        this.updateChildProcesses(themeId);
        break;
      }
      case "ZenThemeMarketplace:IsThemeInstalled": {
        const themeId = message.data.themeId;
        const themes = await this.getThemes();
        return themes[themeId] ? true : false;
      }
      case "ZenThemeMarketplace:CheckForUpdates": {
        this.checkForThemeUpdates();
        break;
      }
    }
  }

  checkForThemeUpdates() {
    console.info("ZenThemeMarketplaceParent: Checking for theme updates");
  }

  async updateChildProcesses(themeId) {
    this.sendAsyncMessage("ZenThemeMarketplace:ThemeChanged", { themeId });
  }

  async getThemes() {
    if (!this._themes) {
      if (!(await IOUtils.exists(this.themesDataFile))) {
        await IOUtils.writeJSON(this.themesDataFile, {});
      }
      this._themes = await IOUtils.readJSON(this.themesDataFile);
    }
    return this._themes;
  }

  updateThemes(themes) {
    this._themes = themes;
    IOUtils.writeJSON(this.themesDataFile, themes);
    this.checkForThemeChanges();
  }

  getStyleSheetFullContent(style) {
    return `
      @-moz-document url-prefix("chrome:") {
        ${style}
      }
    `;
  }

  async downloadUrlToFile(url, path, isStyleSheet = false) {
    try {
      const response = await fetch(url);
      const data = await response.text();
      const content = isStyleSheet ? this.getStyleSheetFullContent(data) : data;
      // convert the data into a Uint8Array
      let buffer = new TextEncoder().encode(content);
      await IOUtils.write(path, buffer);
    } catch (e) {
      console.error("ZenThemeMarketplaceParent: Error downloading file", url, e);
    }
  }

  async downloadThemeFileContents(theme) {
    const themePath = PathUtils.join(this.themesRootPath, theme.id);
    await IOUtils.makeDirectory(themePath, { ignoreExisting: true });
    await this.downloadUrlToFile(theme.style, PathUtils.join(themePath, "chrome.css"), true);
    await this.downloadUrlToFile(theme.readme, PathUtils.join(themePath, "readme.md"));
    if (theme.preferences) {
      await this.downloadUrlToFile(theme.preferences, PathUtils.join(themePath, "preferences.json"));
    }
  }

  get themesRootPath() {
    return PathUtils.join(
      PathUtils.profileDir,
      "chrome",
      "zen-themes"
    );
  }

  get themesDataFile() {
    return PathUtils.join(
      PathUtils.profileDir,
      "zen-themes.json"
    );
  }

  triggerThemeUpdate() {
    const pref = "zen.themes.updated-value-observer";
    Services.prefs.setBoolPref(pref, !Services.prefs.getBoolPref(pref));
  }

  async installTheme(theme) {
    await this.downloadThemeFileContents(theme);
  }

  async checkForThemeChanges() {
    const themes = await this.getThemes();
    const themeIds = Object.keys(themes);
    let changed = false;
    for (const themeId of themeIds) {
      const theme = themes[themeId];
      if (!theme) {
        continue;
      }
      const themePath = PathUtils.join(this.themesRootPath, themeId);
      if (!(await IOUtils.exists(themePath))) {
        await this.installTheme(theme);
        changed = true;
      }
    }
    if (changed) {
      this.triggerThemeUpdate();
    }
  }

  async removeTheme(themeId) {
    const themePath = PathUtils.join(this.themesRootPath, themeId);
    console.info("ZenThemeMarketplaceParent: Removing theme ", themePath);
    await IOUtils.remove(themePath, { recursive: true, ignoreAbsent: true });
    this.triggerThemeUpdate();
  }
};