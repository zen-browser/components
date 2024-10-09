var ZenWorkspacesStorage = {
  async init() {
    console.log('ZenWorkspacesStorage: Initializing...');
    await this._ensureTable();
  },

  async _ensureTable() {
    await PlacesUtils.withConnectionWrapper('ZenWorkspacesStorage._ensureTable', async (db) => {
      // Create the main workspaces table if it doesn't exist
      await db.execute(`
        CREATE TABLE IF NOT EXISTS zen_workspaces (
          id INTEGER PRIMARY KEY,
          uuid TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          icon TEXT,
          is_default INTEGER NOT NULL DEFAULT 0,
          container_id INTEGER,
          position INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `);

      // Create the changes tracking table if it doesn't exist
      await db.execute(`
        CREATE TABLE IF NOT EXISTS zen_workspaces_changes (
          uuid TEXT PRIMARY KEY,
          timestamp INTEGER NOT NULL
        )
      `);
    });
  },

  async migrateWorkspacesFromJSON() {
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

  /**
   * Private helper method to notify observers with a list of changed UUIDs.
   * @param {string} event - The observer event name.
   * @param {Array<string>} uuids - Array of changed workspace UUIDs.
   */
  _notifyWorkspacesChanged(event, uuids) {
    if (uuids.length === 0) return; // No changes to notify

    // Convert the array of UUIDs to a JSON string
    const data = JSON.stringify(uuids);

    Services.obs.notifyObservers(null, event, data);
  },

  async saveWorkspace(workspace, notifyObservers = true) {
    const changedUUIDs = new Set();

    await PlacesUtils.withConnectionWrapper('ZenWorkspacesStorage.saveWorkspace', async (db) => {
      const now = Date.now();

      await db.executeTransaction(async function() {
        // If the workspace is set as default, unset is_default for all other workspaces
        if (workspace.default) {
          await db.execute(`UPDATE zen_workspaces SET is_default = 0 WHERE uuid != :uuid`, { uuid: workspace.uuid });

          // Collect UUIDs of workspaces that were unset as default
          const unsetDefaultRows = await db.execute(`SELECT uuid FROM zen_workspaces WHERE is_default = 0 AND uuid != :uuid`, { uuid: workspace.uuid });
          for (const row of unsetDefaultRows) {
            changedUUIDs.add(row.getResultByName('uuid'));
          }
        }

        // Get the current maximum position
        const maxOrderResult = await db.execute(`SELECT MAX("position") as max_position FROM zen_workspaces`);
        const maxOrder = maxOrderResult[0].getResultByName('max_position') || 0;

        let newOrder;

        if ('position' in workspace && workspace.position !== null && Number.isInteger(workspace.position)) {
          // If position is provided, check if it's already occupied
          const occupiedOrderResult = await db.execute(`
            SELECT uuid FROM zen_workspaces WHERE "position" = :position AND uuid != :uuid
          `, { position: workspace.position, uuid: workspace.uuid });

          if (occupiedOrderResult.length > 0) {
            // If the position is occupied, shift the positions of subsequent workspaces
            await db.execute(`
              UPDATE zen_workspaces
              SET "position" = "position" + 1
              WHERE "position" >= :position AND uuid != :uuid
            `, { position: workspace.position, uuid: workspace.uuid });

            // Collect UUIDs of workspaces whose positions were shifted
            for (const row of occupiedOrderResult) {
              changedUUIDs.add(row.getResultByName('uuid'));
            }
          }

          newOrder = workspace.position;
        } else {
          // If no position is provided, set it to the last position
          newOrder = maxOrder + 1;
        }

        // Insert or replace the workspace
        await db.executeCached(`
          INSERT OR REPLACE INTO zen_workspaces (
            uuid, name, icon, is_default, container_id, created_at, updated_at, "position"
          ) VALUES (
            :uuid, :name, :icon, :is_default, :container_id, 
            COALESCE((SELECT created_at FROM zen_workspaces WHERE uuid = :uuid), :now),
            :now,
            :position
          )
        `, {
          uuid: workspace.uuid,
          name: workspace.name,
          icon: workspace.icon || null,
          is_default: workspace.default ? 1 : 0,
          container_id: workspace.containerTabId || null,
          now,
          position: newOrder
        });

        // Record the change in the changes tracking table
        await db.execute(`
          INSERT OR REPLACE INTO zen_workspaces_changes (uuid, timestamp)
          VALUES (:uuid, :timestamp)
        `, {
          uuid: workspace.uuid,
          timestamp: Math.floor(now / 1000) // Unix timestamp in seconds
        });

        // Add the main workspace UUID to the changed set
        changedUUIDs.add(workspace.uuid);
      });
    });

    if (notifyObservers) {
      this._notifyWorkspacesChanged("zen-workspace-updated", Array.from(changedUUIDs));
    }
  },

  async getWorkspaces() {
    const db = await PlacesUtils.promiseDBConnection();
    const rows = await db.executeCached(`
      SELECT * FROM zen_workspaces ORDER BY created_at ASC
    `);
    return rows.map((row) => ({
      uuid: row.getResultByName('uuid'),
      name: row.getResultByName('name'),
      icon: row.getResultByName('icon'),
      default: !!row.getResultByName('is_default'),
      containerTabId: row.getResultByName('container_id'),
      position: row.getResultByName('position'),
    }));
  },

  async removeWorkspace(uuid, notifyObservers = true) {
    const changedUUIDs = [uuid];

    await PlacesUtils.withConnectionWrapper('ZenWorkspacesStorage.removeWorkspace', async (db) => {
      await db.execute(
          `
            DELETE FROM zen_workspaces WHERE uuid = :uuid
          `,
          { uuid }
      );

      // Record the removal as a change
      const now = Date.now();
      await db.execute(`
        INSERT OR REPLACE INTO zen_workspaces_changes (uuid, timestamp)
        VALUES (:uuid, :timestamp)
      `, {
        uuid,
        timestamp: Math.floor(now / 1000)
      });
    });

    if (notifyObservers) {
      this._notifyWorkspacesChanged("zen-workspace-removed", changedUUIDs);
    }
  },

  async wipeAllWorkspaces() {
    await PlacesUtils.withConnectionWrapper('ZenWorkspacesStorage.wipeAllWorkspaces', async (db) => {
      await db.execute(`DELETE FROM zen_workspaces`);
      await db.execute(`DELETE FROM zen_workspaces_changes`);
    });
  },

  async setDefaultWorkspace(uuid, notifyObservers = true) {
    const changedUUIDs = [];

    await PlacesUtils.withConnectionWrapper('ZenWorkspacesStorage.setDefaultWorkspace', async (db) => {
      await db.executeTransaction(async function () {
        const now = Date.now();
        // Unset the default flag for all other workspaces
        await db.execute(`UPDATE zen_workspaces SET is_default = 0 WHERE uuid != :uuid`, { uuid });

        // Collect UUIDs of workspaces that were unset as default
        const unsetDefaultRows = await db.execute(`SELECT uuid FROM zen_workspaces WHERE is_default = 0 AND uuid != :uuid`, { uuid });
        for (const row of unsetDefaultRows) {
          changedUUIDs.push(row.getResultByName('uuid'));
        }

        // Set the default flag for the specified workspace
        await db.execute(`UPDATE zen_workspaces SET is_default = 1 WHERE uuid = :uuid`, { uuid });

        // Record the change for the specified workspace
        await db.execute(`
          INSERT OR REPLACE INTO zen_workspaces_changes (uuid, timestamp)
          VALUES (:uuid, :timestamp)
        `, {
          uuid,
          timestamp: Math.floor(now / 1000)
        });

        // Add the main workspace UUID to the changed set
        changedUUIDs.push(uuid);
      });
    });

    if (notifyObservers) {
      this._notifyWorkspacesChanged("zen-workspace-updated", changedUUIDs);
    }
  },

  async markChanged(uuid) {
    await PlacesUtils.withConnectionWrapper('ZenWorkspacesStorage.markChanged', async (db) => {
      const now = Date.now();
      await db.execute(`
        INSERT OR REPLACE INTO zen_workspaces_changes (uuid, timestamp)
        VALUES (:uuid, :timestamp)
      `, {
        uuid,
        timestamp: Math.floor(now / 1000)
      });
    });
  },

  async getChangedIDs() {
    const db = await PlacesUtils.promiseDBConnection();
    const rows = await db.execute(`
      SELECT uuid, timestamp FROM zen_workspaces_changes
    `);
    const changes = {};
    for (const row of rows) {
      changes[row.getResultByName('uuid')] = row.getResultByName('timestamp');
    }
    return changes;
  },

  async clearChangedIDs() {
    await PlacesUtils.withConnectionWrapper('ZenWorkspacesStorage.clearChangedIDs', async (db) => {
      await db.execute(`DELETE FROM zen_workspaces_changes`);
    });
  },

  async updateWorkspaceOrder(uuid, newOrder, notifyObservers = true) {
    const changedUUIDs = [uuid];

    await PlacesUtils.withConnectionWrapper('ZenWorkspacesStorage.updateWorkspaceOrder', async (db) => {
      await db.executeTransaction(async function () {
        // Get the current position of the workspace
        const currentOrderResult = await db.execute(`
          SELECT "position" FROM zen_workspaces WHERE uuid = :uuid
        `, { uuid });
        const currentOrder = currentOrderResult[0].getResultByName('position');

        if (currentOrder === newOrder) {
          return; // No change needed
        }

        if (newOrder > currentOrder) {
          // Moving down: decrement position of workspaces between old and new positions
          const rows = await db.execute(`
            SELECT uuid FROM zen_workspaces
            WHERE "position" > :currentOrder AND "position" <= :newOrder
          `, { currentOrder, newOrder });

          await db.execute(`
            UPDATE zen_workspaces
            SET "position" = "position" - 1
            WHERE "position" > :currentOrder AND "position" <= :newOrder
          `, { currentOrder, newOrder });

          for (const row of rows) {
            changedUUIDs.push(row.getResultByName('uuid'));
          }
        } else {
          // Moving up: increment position of workspaces between new and old positions
          const rows = await db.execute(`
            SELECT uuid FROM zen_workspaces
            WHERE "position" >= :newOrder AND "position" < :currentOrder
          `, { currentOrder, newOrder });

          await db.execute(`
            UPDATE zen_workspaces
            SET "position" = "position" + 1
            WHERE "position" >= :newOrder AND "position" < :currentOrder
          `, { currentOrder, newOrder });

          for (const row of rows) {
            changedUUIDs.push(row.getResultByName('uuid'));
          }
        }

        // Set the new position for the workspace
        await db.execute(`
          UPDATE zen_workspaces
          SET "position" = :newOrder
          WHERE uuid = :uuid
        `, { uuid, newOrder });

        // Record the change for the specified workspace
        const now = Date.now();
        await db.execute(`
          INSERT OR REPLACE INTO zen_workspaces_changes (uuid, timestamp)
          VALUES (:uuid, :timestamp)
        `, {
          uuid,
          timestamp: Math.floor(now / 1000)
        });

        // Add the main workspace UUID to the changed set
        changedUUIDs.push(uuid);
      });
    });

    if (notifyObservers) {
      this._notifyWorkspacesChanged("zen-workspace-updated", changedUUIDs);
    }
  },
};
