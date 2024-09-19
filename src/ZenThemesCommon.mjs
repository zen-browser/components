var ZenThemesCommon = {
  kZenOSToSmallName: {
    WINNT: 'windows',
    Darwin: 'macos',
    Linux: 'linux',
  },

  kZenColors: ['#aac7ff', '#74d7cb', '#a0d490', '#dec663', '#ffb787', '#dec1b1', '#ffb1c0', '#ddbfc3', '#f6b0ea', '#d4bbff'],

  get currentOperatingSystem() {
    let os = Services.appinfo.OS;
    return this.kZenOSToSmallName[os];
  },

  get themesRootPath() {
    return PathUtils.join(PathUtils.profileDir, 'chrome', 'zen-themes');
  },

  get themesDataFile() {
    return PathUtils.join(PathUtils.profileDir, 'zen-themes.json');
  },

  getThemeFolder(themeId) {
    return PathUtils.join(this.themesRootPath, themeId);
  },

  getBrowser() {
    if (!this.__browser) {
      this.__browser = Services.wm.getMostRecentWindow('navigator:browser');
    }

    return this.__browser;
  },

  async getThemes() {
    if (!this._themes) {
      if (!(await IOUtils.exists(this.themesDataFile))) {
        await IOUtils.writeJSON(this.themesDataFile, {});
      }
      this._themes = await IOUtils.readJSON(this.themesDataFile);
    }
    return this._themes;
  },

  async getThemePreferences(theme) {
    const themePath = PathUtils.join(this.themesRootPath, theme.id, 'preferences.json');
    if (!(await IOUtils.exists(themePath)) || !theme.preferences) {
      return [];
    }

    const preferences = await IOUtils.readJSON(themePath);

    // compat mode for old preferences, all of them can only be checkboxes
    if (typeof preferences === 'object' && !Array.isArray(preferences)) {
      console.warn(
        `[ZenThemes]: Warning, ${theme.name} uses legacy preferences, please migrate them to the new preferences style, as legacy preferences might be removed at a future release. More information at: https://docs.zen-browser.app/themes-store/themes-marketplace-preferences`
      );
      const newThemePreferences = [];

      for (let [entry, label] of Object.entries(preferences)) {
        const [_, negation = '', os = '', property] = /(!?)(?:(macos|windows|linux):)?([A-z0-9-_.]+)/g.exec(entry);
        const isNegation = negation === '!';

        if (
          (isNegation && os === this.currentOperatingSystem) ||
          (os !== '' && os !== this.currentOperatingSystem && !isNegation)
        ) {
          continue;
        }

        newThemePreferences.push({
          property,
          label,
          type: 'checkbox',
          disabledOn: os !== '' ? [os] : [],
        });
      }

      return newThemePreferences;
    }

    return preferences.filter(({ disabledOn = [] }) => !disabledOn.includes(this.currentOperatingSystem));
  },

  throttle(mainFunction, delay) {
    let timerFlag = null;

    return (...args) => {
      if (timerFlag === null) {
        mainFunction(...args);
        timerFlag = setTimeout(() => {
          timerFlag = null;
        }, delay);
      }
    };
  },
};
