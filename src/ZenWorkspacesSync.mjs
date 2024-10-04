var { XPCOMUtils } = ChromeUtils.importESModule("resource://gre/modules/XPCOMUtils.sys.mjs");
var { LegacyTracker } = ChromeUtils.importESModule("resource://services-sync/engines.sys.mjs");
var { Store } = ChromeUtils.importESModule("resource://services-sync/engines.sys.mjs");
var { SyncEngine } = ChromeUtils.importESModule("resource://services-sync/engines.sys.mjs");
var { CryptoWrapper } = ChromeUtils.importESModule("resource://services-sync/record.sys.mjs");
var { Svc,Utils  } = ChromeUtils.importESModule("resource://services-sync/util.sys.mjs");
var { SCORE_INCREMENT_XLARGE } = ChromeUtils.importESModule("resource://services-sync/constants.sys.mjs");

function ZenWorkspacesTracker(name, engine) {
    LegacyTracker.call(this, name, engine);
}

ZenWorkspacesTracker.prototype = {
    __proto__: LegacyTracker.prototype,

    start() {
        if (this._started) {
            return;
        }
        this._log.trace("Starting tracker");
        Services.obs.addObserver(this, "zen-workspace-added");
        Services.obs.addObserver(this, "zen-workspace-removed");
        Services.obs.addObserver(this, "zen-workspace-updated");
        this._started = true;
    },

    stop() {
        if (!this._started) {
            return;
        }
        this._log.trace("Stopping tracker");
        Services.obs.removeObserver(this, "zen-workspace-added");
        Services.obs.removeObserver(this, "zen-workspace-removed");
        Services.obs.removeObserver(this, "zen-workspace-updated");
        this._started = false;
    },

    observe(subject, topic, data) {
        switch (topic) {
            case "zen-workspace-removed":
            case "zen-workspace-updated":
            case "zen-workspace-added":
                let workspaceID = data;
                this._log.trace(`Observed ${topic} for ${workspaceID}`);
                this.addChangedID(workspaceID);
                this.score += SCORE_INCREMENT_XLARGE;
                break;
        }
    },
};

function ZenWorkspacesStore(name, engine) {
    Store.call(this, name, engine);
}

ZenWorkspacesStore.prototype = {
    __proto__: Store.prototype,

    async getAllIDs() {
        try {
            let workspaces = await ZenWorkspacesStorage.getWorkspaces();
            let ids = {};
            for (let workspace of workspaces) {
                ids[workspace.uuid] = true;
            }
            return ids;
        } catch (error) {
            this._log.error("Error fetching all workspace IDs", error);
            throw error;
        }
    },

    async changeItemID(oldID, newID) {
        try {
            let workspaces = await ZenWorkspacesStorage.getWorkspaces();
            let workspace = workspaces.find(ws => ws.uuid === oldID);
            if (workspace) {
                workspace.uuid = newID;
                await ZenWorkspacesStorage.saveWorkspace(workspace);
            }
        } catch (error) {
            this._log.error(`Error changing workspace ID from ${oldID} to ${newID}`, error);
            throw error;
        }
    },

    async itemExists(id) {
        try {
            let workspaces = await ZenWorkspacesStorage.getWorkspaces();
            return workspaces.some(ws => ws.uuid === id);
        } catch (error) {
            this._log.error(`Error checking if workspace exists with ID ${id}`, error);
            throw error;
        }
    },

    async createRecord(id, collection) {
        try {
            let workspaces = await ZenWorkspacesStorage.getWorkspaces();
            let workspace = workspaces.find(ws => ws.uuid === id);
            let record = new ZenWorkspaceRecord(collection, id);

            if (workspace) {
                record.name = workspace.name;
                record.icon = workspace.icon;
                record.default = workspace.default;
                record.containerTabId = workspace.containerTabId;
                record.themeColor = workspace.themeColor;
                record.deleted = false;
            } else {
                record.deleted = true;
            }

            return record;
        } catch (error) {
            this._log.error(`Error creating record for workspace ID ${id}`, error);
            throw error;
        }
    },

    async create(record) {
        try {
            // Data validation
            this._validateRecord(record);

            let workspace = {
                uuid: record.id,
                name: record.name,
                icon: record.icon,
                default: record.default,
                containerTabId: record.containerTabId,
                themeColor: record.themeColor,
            };
            await ZenWorkspacesStorage.saveWorkspace(workspace);
        } catch (error) {
            this._log.error(`Error creating workspace with ID ${record.id}`, error);
            throw error;
        }
    },

    async update(record) {
        try {
            // Data validation
            this._validateRecord(record);

            await this.create(record);
        } catch (error) {
            this._log.error(`Error updating workspace with ID ${record.id}`, error);
            throw error;
        }
    },

    async remove(record) {
        try {
            await ZenWorkspacesStorage.removeWorkspace(record.id);
        } catch (error) {
            this._log.error(`Error removing workspace with ID ${record.id}`, error);
            throw error;
        }
    },

    async wipe() {
        try {
            let workspaces = await ZenWorkspacesStorage.getWorkspaces();
            for (let workspace of workspaces) {
                await ZenWorkspacesStorage.removeWorkspace(workspace.uuid);
            }
        } catch (error) {
            this._log.error("Error wiping all workspaces", error);
            throw error;
        }
    },

    _validateRecord(record) {
        if (!record.id || typeof record.id !== "string") {
            throw new Error("Invalid workspace ID");
        }
        if (!record.name || typeof record.name !== "string") {
            throw new Error(`Invalid workspace name for ID ${record.id}`);
        }
        // 'default' is a boolean; if undefined, default to false
        if (typeof record.default !== "boolean") {
            record.default = false;
        }
        // 'icon' and 'containerTabId' can be null, but should be validated if present
        if (record.icon != null && typeof record.icon !== "string") {
            throw new Error(`Invalid icon for workspace ID ${record.id}`);
        }
        if (record.containerTabId != null && typeof record.containerTabId !== "number") {
            throw new Error(`Invalid containerTabId for workspace ID ${record.id}`);
        }
        // Validate themeColor
        if (record.themeColor != null && typeof record.themeColor !== "string" && !this._validateHexColor(record.themeColor)) {
            throw new Error(`Invalid themeColor for workspace ID ${record.id}`);
        }
    },

    _validateHexColor(hex) {
        const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
        return hexRegex.test(hex);
    }
};

function ZenWorkspacesEngine(service) {
    SyncEngine.call(this, "Workspaces", service);
}

ZenWorkspacesEngine.prototype = {
    __proto__: SyncEngine.prototype,

    _storeObj: ZenWorkspacesStore,
    _trackerObj: ZenWorkspacesTracker,
    _recordObj: ZenWorkspaceRecord,

};

function ZenWorkspaceRecord(collection, id) {
    CryptoWrapper.call(this, collection, id);
}

ZenWorkspaceRecord.prototype = {
    __proto__: CryptoWrapper.prototype,
    _logName: "Sync.Record.ZenWorkspace",

};

Utils.deferGetSet(ZenWorkspaceRecord, "cleartext", [
    "name",
    "icon",
    "default",
    "containerTabId",
    "themeColor"
]);
