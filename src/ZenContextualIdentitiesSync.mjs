var { Tracker, Store, SyncEngine } = ChromeUtils.importESModule("resource://services-sync/engines.sys.mjs");
var { CryptoWrapper } = ChromeUtils.importESModule("resource://services-sync/record.sys.mjs");
var { Utils } = ChromeUtils.importESModule("resource://services-sync/util.sys.mjs");
var { SCORE_INCREMENT_XLARGE } = ChromeUtils.importESModule("resource://services-sync/constants.sys.mjs");

// Define ZenContextualIdentityRecord
function ZenContextualIdentityRecord(collection, id) {
    CryptoWrapper.call(this, collection, id);
}

ZenContextualIdentityRecord.prototype = Object.create(CryptoWrapper.prototype);
ZenContextualIdentityRecord.prototype.constructor = ZenContextualIdentityRecord;

ZenContextualIdentityRecord.prototype._logName = "Sync.Record.ZenContextualIdentity";

Utils.deferGetSet(ZenContextualIdentityRecord, "cleartext", [
    "name",
    "icon",
    "color",
    "public",
]);

// Define ZenContextualIdentityStore
function ZenContextualIdentityStore(name, engine) {
    Store.call(this, name, engine);
    this._changedIDs = {};
}

ZenContextualIdentityStore.prototype = Object.create(Store.prototype);
ZenContextualIdentityStore.prototype.constructor = ZenContextualIdentityStore;

ZenContextualIdentityStore.prototype.initialize = async function () {
    await Store.prototype.initialize.call(this);
    await this._loadChangedIDs();
};

ZenContextualIdentityStore.prototype._loadChangedIDs = async function () {
    try {
        let path = PathUtils.join(Services.dirsvc.get("ProfD", Ci.nsIFile).path, "containers-sync-changes.json");
        let bytes = await IOUtils.read(path);
        let json = new TextDecoder().decode(bytes);
        this._changedIDs = JSON.parse(json);
    } catch (error) {
        if (error.name !== 'NotFoundError') {
            this._log.error("Error loading changed IDs from storage", error);
        }
        this._changedIDs = {};
    }
};

ZenContextualIdentityStore.prototype._saveChangedIDs = async function () {
    try {
        let path = PathUtils.join(Services.dirsvc.get("ProfD", Ci.nsIFile).path, "containers-sync-changes.json");
        let json = JSON.stringify(this._changedIDs);
        let bytes = new TextEncoder().encode(json);
        await IOUtils.write(path, bytes, { tmpPath: path + ".tmp" });
    } catch (error) {
        this._log.error("Error saving changed IDs to storage", error);
    }
};

ZenContextualIdentityStore.prototype.getAllIDs = async function () {
    try {
        ContextualIdentityService.ensureDataReady();
        const identities = ContextualIdentityService.getPublicIdentities();
        const ids = {};
        for (const identity of identities) {
            ids[identity.userContextId.toString()] = true;
        }
        return ids;
    } catch (error) {
        this._log.error("Error fetching all contextual identity IDs", error);
        throw error;
    }
};

ZenContextualIdentityStore.prototype.itemExists = async function (id) {
    try {
        ContextualIdentityService.ensureDataReady();
        const identity = ContextualIdentityService.getPublicIdentityFromId(parseInt(id));
        return !!identity;
    } catch (error) {
        this._log.error(`Error checking if contextual identity exists with ID ${id}`, error);
        throw error;
    }
};

ZenContextualIdentityStore.prototype.createRecord = async function (id, collection) {
    try {
        ContextualIdentityService.ensureDataReady();
        const identity = ContextualIdentityService.getPublicIdentityFromId(parseInt(id));
        const record = new ZenContextualIdentityRecord(collection, id);

        if (identity) {
            record.name = identity.name;
            record.icon = identity.icon;
            record.color = identity.color;
            record.public = identity.public;
            record.deleted = false;
        } else {
            record.deleted = true;
        }

        return record;
    } catch (error) {
        this._log.error(`Error creating record for contextual identity ID ${id}`, error);
        throw error;
    }
};

ZenContextualIdentityStore.prototype.create = async function (record) {
    try {
        this._validateRecord(record);
        ContextualIdentityService.ensureDataReady();
        ContextualIdentityService.createWithId(parseInt(record.id), record.name, record.icon, record.color);
    } catch (error) {
        this._log.error(`Error creating contextual identity with ID ${record.id}`, error);
        throw error;
    }
};

ZenContextualIdentityStore.prototype.update = async function (record) {
    try {
        this._validateRecord(record);
        ContextualIdentityService.ensureDataReady();
        let userContextId = parseInt(record.id);
        let success = ContextualIdentityService.update(userContextId, record.name, record.icon, record.color);
        if (!success) {
            // Identity not found, create it
            await this.create(record);
        }
    } catch (error) {
        this._log.error(`Error updating contextual identity with ID ${record.id}`, error);
        throw error;
    }
};

ZenContextualIdentityStore.prototype.remove = async function (record) {
    try {
        ContextualIdentityService.ensureDataReady();
        ContextualIdentityService.remove(parseInt(record.id));
    } catch (error) {
        this._log.error(`Error removing contextual identity with ID ${record.id}`, error);
        throw error;
    }
};

ZenContextualIdentityStore.prototype.wipe = async function () {
    try {
        ContextualIdentityService.ensureDataReady();
        const identities = ContextualIdentityService.getPublicIdentities();
        for (const identity of identities) {
            ContextualIdentityService.remove(identity.userContextId);
        }
    } catch (error) {
        this._log.error("Error wiping all contextual identities", error);
        throw error;
    }
};

ZenContextualIdentityStore.prototype.getChangedIDs = async function () {
    return this._changedIDs;
};

ZenContextualIdentityStore.prototype.clearChangedIDs = async function () {
    this._changedIDs = {};
    await this._saveChangedIDs();
};

ZenContextualIdentityStore.prototype.markChanged = async function (id) {
    this._changedIDs[id] = Date.now() / 1000; // Timestamp in seconds
    await this._saveChangedIDs();
};

ZenContextualIdentityStore.prototype._validateRecord = function (record) {
    if (!record.id || typeof record.id !== "string") {
        throw new Error("Invalid contextual identity ID");
    }
    if (!record.name || typeof record.name !== "string") {
        throw new Error(`Invalid contextual identity name for ID ${record.id}`);
    }
    if (!record.icon || typeof record.icon !== "string") {
        throw new Error(`Invalid icon for contextual identity ID ${record.id}`);
    }
    if (!record.color || typeof record.color !== "string") {
        throw new Error(`Invalid color for contextual identity ID ${record.id}`);
    }
    if (record.public != null && typeof record.public !== "boolean") {
        throw new Error(`Invalid public flag for contextual identity ID ${record.id}`);
    }
};

// Define ZenContextualIdentityTracker
function ZenContextualIdentityTracker(name, engine) {
    Tracker.call(this, name, engine);
    this._ignoreAll = false;

    // Observe profile-before-change to stop the tracker gracefully
    Services.obs.addObserver(this.asyncObserver, "profile-before-change");
}

ZenContextualIdentityTracker.prototype = Object.create(Tracker.prototype);
ZenContextualIdentityTracker.prototype.constructor = ZenContextualIdentityTracker;

ZenContextualIdentityTracker.prototype.getChangedIDs = async function () {
    try {
        return await this.engine._store.getChangedIDs();
    } catch (error) {
        this._log.error("Error retrieving changed IDs from store", error);
        throw error;
    }
};

ZenContextualIdentityTracker.prototype.clearChangedIDs = async function () {
    try {
        await this.engine._store.clearChangedIDs();
    } catch (error) {
        this._log.error("Error clearing changed IDs in store", error);
        throw error;
    }
};

ZenContextualIdentityTracker.prototype.onStart = function () {
    if (this._started) {
        return;
    }
    this._log.trace("Starting tracker");
    // Register observers for contextual identity changes
    Services.obs.addObserver(this.asyncObserver, "contextual-identity-created");
    Services.obs.addObserver(this.asyncObserver, "contextual-identity-updated");
    Services.obs.addObserver(this.asyncObserver, "contextual-identity-deleted");
    this._started = true;
};

ZenContextualIdentityTracker.prototype.onStop = function () {
    if (!this._started) {
        return;
    }
    this._log.trace("Stopping tracker");
    // Unregister observers for contextual identity changes
    Services.obs.removeObserver(this.asyncObserver, "contextual-identity-created");
    Services.obs.removeObserver(this.asyncObserver, "contextual-identity-updated");
    Services.obs.removeObserver(this.asyncObserver, "contextual-identity-deleted");
    this._started = false;
};

ZenContextualIdentityTracker.prototype.observe = async function (subject, topic, data) {
    if (this.ignoreAll) {
        return;
    }

    try {
        switch (topic) {
            case "profile-before-change":
                await this.stop();
                break;
            case "contextual-identity-created":
            case "contextual-identity-updated":
            case "contextual-identity-deleted":
                let userContextId = subject.wrappedJSObject.userContextId.toString();
                this._log.trace(`Observed ${topic} for userContextId: ${userContextId}`);
                await this.engine._store.markChanged(userContextId);
                this.score += SCORE_INCREMENT_XLARGE;
                break;
        }
    } catch (error) {
        this._log.error(`Error handling ${topic} in observe method`, error);
    }
};

// Define ContextualIdentityEngine
function ZenContextualIdentityEngine(service) {
    SyncEngine.call(this, "ContextualIdentities", service);
}

ZenContextualIdentityEngine.prototype = Object.create(SyncEngine.prototype);
ZenContextualIdentityEngine.prototype.constructor = ZenContextualIdentityEngine;

ZenContextualIdentityEngine.prototype._storeObj = ZenContextualIdentityStore;
ZenContextualIdentityEngine.prototype._trackerObj = ZenContextualIdentityTracker;
ZenContextualIdentityEngine.prototype._recordObj = ZenContextualIdentityRecord;
ZenContextualIdentityEngine.prototype.version = 1;

ZenContextualIdentityEngine.prototype.syncPriority = 10;
ZenContextualIdentityEngine.prototype.allowSkippedRecord = false;

Object.setPrototypeOf(ZenContextualIdentityEngine.prototype, SyncEngine.prototype);





