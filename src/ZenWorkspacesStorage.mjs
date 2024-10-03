var ZenWorkspacesStorage = {
  async init() {
    console.log('ZenWorkspacesStorage: Initializing...');
    await this._ensureTable();
  },

  async _ensureTable() {
    await PlacesUtils.withConnectionWrapper("ZenWorkspacesStorage._ensureTable", async db => {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS zen_workspaces (
          id INTEGER PRIMARY KEY,
          uuid TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          icon TEXT,
          is_default INTEGER NOT NULL DEFAULT 0,
          container_id INTEGER,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `);
    });
  },

  async saveWorkspace(workspace) {
    await PlacesUtils.withConnectionWrapper("ZenWorkspacesStorage.saveWorkspace", async db => {
      const now = Date.now();
      await db.executeCached(`
        INSERT OR REPLACE INTO zen_workspaces (
          uuid, name, icon, is_default, container_id, created_at, updated_at
        ) VALUES (
          :uuid, :name, :icon, :is_default, :container_id, 
          COALESCE((SELECT created_at FROM zen_workspaces WHERE uuid = :uuid), :now),
          :now
        )
      `, {
        uuid: workspace.uuid,
        name: workspace.name,
        icon: workspace.icon || null,
        is_default: workspace.default ? 1 : 0,
        container_id: workspace.containerTabId || null,
        now
      });
    });
  },

  async getWorkspaces() {
    const db = await PlacesUtils.promiseDBConnection();
    const rows = await db.execute(`
      SELECT * FROM zen_workspaces ORDER BY created_at ASC
    `);
    return rows.map(row => ({
      uuid: row.getResultByName("uuid"),
      name: row.getResultByName("name"),
      icon: row.getResultByName("icon"),
      default: !!row.getResultByName("is_default"),
      containerTabId: row.getResultByName("container_id")
    }));
  },

  async removeWorkspace(uuid) {
    await PlacesUtils.withConnectionWrapper("ZenWorkspacesStorage.removeWorkspace", async db => {
      await db.execute(`
        DELETE FROM zen_workspaces WHERE uuid = :uuid
      `, { uuid });
    });
  },

  async setDefaultWorkspace(uuid) {
    await PlacesUtils.withConnectionWrapper("ZenWorkspacesStorage.setDefaultWorkspace", async db => {
      await db.executeTransaction(async function() {
        await db.execute(`UPDATE zen_workspaces SET is_default = 0`);
        await db.execute(`UPDATE zen_workspaces SET is_default = 1 WHERE uuid = :uuid`, { uuid });
      });
    });
  }
};