var ZenWorkspacesStorage = {
  async init() {
    console.log('ZenWorkspacesStorage: Initializing...');
    await this._ensureTable();
  },

  async _ensureTable() {
    await PlacesUtils.withConnectionWrapper('ZenWorkspacesStorage._ensureTable', async (db) => {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS zen_workspaces (
          id INTEGER PRIMARY KEY,
          uuid TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          icon TEXT,
          is_default INTEGER NOT NULL DEFAULT 0,
          container_id INTEGER,
          theme_color TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `);
    });
    await this._migrateWorkspacesFromJSON();
  },

  async _migrateWorkspacesFromJSON() {
    const oldWorkspacesPath = PathUtils.join(PathUtils.profileDir, 'zen-workspaces', 'Workspaces.json');
    if (await IOUtils.exists(oldWorkspacesPath)) {
      console.info('ZenWorkspacesStorage: Migrating workspaces from JSON...');
      const oldWorkspaces = await IOUtils.readJSON(oldWorkspacesPath);
      if (oldWorkspaces.workspaces) {
        for (const workspace of oldWorkspaces.workspaces) {
          await this.saveWorkspace(workspace);
        }
      }
      await IOUtils.remove(oldWorkspacesPath);
    }
  },

  async saveWorkspace(workspace) {
    await PlacesUtils.withConnectionWrapper('ZenWorkspacesStorage.saveWorkspace', async (db) => {
      const now = Date.now();

      await db.executeTransaction(async function() {
        // If the workspace is set as default, unset is_default for all other workspaces
        if (workspace.default) {
          await db.execute(`UPDATE zen_workspaces SET is_default = 0 WHERE uuid != :uuid`, { uuid: workspace.uuid });
        }

        // Then insert or replace the workspace
        await db.executeCached(`
          INSERT OR REPLACE INTO zen_workspaces (
          uuid, name, icon, is_default, container_id, theme_color, created_at, updated_at
        ) VALUES (
          :uuid, :name, :icon, :is_default, :container_id, :theme_color,
          COALESCE((SELECT created_at FROM zen_workspaces WHERE uuid = :uuid), :now),
          :now
        )
        `, {
          uuid: workspace.uuid,
          name: workspace.name,
          icon: workspace.icon || null,
          is_default: workspace.default ? 1 : 0,
          container_id: workspace.containerTabId || null,
          theme_color: workspace.themeColor || null,
          now
        });
      });
    });
  },

  async getWorkspaces() {
    const db = await PlacesUtils.promiseDBConnection();
    const rows = await db.execute(`
      SELECT * FROM zen_workspaces ORDER BY created_at ASC
    `);
    return rows.map((row) => ({
      uuid: row.getResultByName('uuid'),
      name: row.getResultByName('name'),
      icon: row.getResultByName('icon'),
      default: !!row.getResultByName('is_default'),
      containerTabId: row.getResultByName('container_id'),
      themeColor: row.getResultByName('theme_color')
    }));
  },

  async removeWorkspace(uuid) {
    await PlacesUtils.withConnectionWrapper('ZenWorkspacesStorage.removeWorkspace', async (db) => {
      await db.execute(
        `
        DELETE FROM zen_workspaces WHERE uuid = :uuid
      `,
        { uuid }
      );
    });
  },

  async setDefaultWorkspace(uuid) {
    await PlacesUtils.withConnectionWrapper('ZenWorkspacesStorage.setDefaultWorkspace', async (db) => {
      await db.executeTransaction(async function () {
        await db.execute(`UPDATE zen_workspaces SET is_default = 0`);
        await db.execute(`UPDATE zen_workspaces SET is_default = 1 WHERE uuid = :uuid`, { uuid });
      });
    });
  },
};
