let quickarchiverStorage = {

    headerParser: {},
    dbConnection: null,
    dbSchema: {
        tables: {
            rules: "field TEXT, \
                   operator TEXT, \
                   value TEXT, \
                   folder TEXT",
            misc: "key TEXT, \
                   value TEXT"
        }
    },
    cache: {},
    init: function () {

        let dirService = Components.classes["@mozilla.org/file/directory_service;1"].getService(Components.interfaces.nsIProperties);
        let dbFile = dirService.get("ProfD", Components.interfaces.nsIFile);

        dbFile.append("quickarchiver.sqlite");

        let dbService = Components.classes["@mozilla.org/storage/service;1"].getService(Components.interfaces.mozIStorageService);
        let dbConnection;

        if (!dbFile.exists())
            dbConnection = this.dbCreate(dbService, dbFile);
        else {
            dbConnection = dbService.openDatabase(dbFile);
        }
        this.dbConnection = dbConnection;
        this.headerParser = Components.classes["@mozilla.org/messenger/headerparser;1"].getService(Components.interfaces.nsIMsgHeaderParser);

        this.dbCheckUpdate();
        this.cleanupDatabase();
    },
    dbCreate: function (aDBService, aDBFile) {
        let dbConnection = aDBService.openDatabase(aDBFile);
        this.dbCreateTables(dbConnection);
        return dbConnection;
    },
    dbCreateTables: function (aDBConnection) {
        for (let name in this.dbSchema.tables)
            aDBConnection.createTable(name, this.dbSchema.tables[name]);
    },
    dbCheckUpdate: function () {

        let statement = this.dbConnection.createStatement(
            "SELECT COUNT(*) as c FROM sqlite_master " +
            "WHERE type='table' and name='misc';");

        try {
            while (statement.step()) {

                if (statement.row.c == "0") {

                    // old scheme, so update
                    this.dbCreateTables(this.dbConnection);

                    // insert first version number

                    let statement_ver = this.dbConnection.createStatement(
                        "INSERT INTO misc VALUES ('version', 1)");

                    try {
                        statement_ver.step();
                    } finally {
                        statement_ver.reset();
                    }
                }
            }
        } finally {
            statement.reset();
        }

        statement = this.dbConnection.createStatement(
            "SELECT value as version FROM misc where key='version';");

        let version = null;
        try {
            while (statement.step()) {
                version = statement.row.version;
            }
        } finally {
            statement.reset();
        }

        switch (version) {

            case "1":

                statement = this.dbConnection.createStatement(
                    "INSERT INTO rules (field, operator, value, folder) " +
                    "SELECT 'from' AS field, '=' AS operator, address AS value, uri AS folder FROM senders;");

                try {
                    statement.step();
                } finally {
                    statement.reset();
                }

                let statement = this.dbConnection.createStatement(
                    "UPDATE misc SET value=2 WHERE key = 'version';");
                try {
                    statement.step();
                } finally {
                    statement.reset();
                }

                break;
        }
    },
    parseEmailAddress: function (author) {

        let addresses = this.headerParser.parseEncodedHeader(author);

        if (typeof addresses[0] != "undefined" && addresses[0].email) {
            return addresses[0].email;
        }

        return author;
    },
    dbGetRuleFromHdr: function (hdr) {

        let sql = "SELECT rowid,* FROM rules WHERE 0 ";

        if (hdr.subject) {
            sql += "OR (field='subject' AND :subject LIKE '%' || value || '%' ESCAPE '/') ";
        }
        if (hdr.author) {
            sql += "OR (field='from' AND :from LIKE '%' || value || '%' ESCAPE '/') ";
        }
        if (hdr.recipients) {
            sql += "OR (field='to' AND :to LIKE '%' || value || '%' ESCAPE '/') ";
        }

        let statement = this.dbConnection.createStatement(sql);

        let cache_id = '';

        if (hdr.subject) {
            statement.params.subject = hdr.subject;
            cache_id += 'SUBJECT:'+ hdr.subject;
        }

        if (hdr.author) {

            let author = this.parseEmailAddress(hdr.author);
            statement.params.from = author;
            cache_id += 'FROM:'+ author;

        }

        if (hdr.recipients) {

            let recipients = this.parseEmailAddress(hdr.recipients);
            statement.params.to = recipients;
            cache_id += 'TO:'+recipients;
        }

        if (typeof (this.cache[cache_id]) != "undefined") {
            return this.cache[cache_id];
        }

        let data = {};

        try {
            while (statement.step()) {
                data['id'] = statement.row.rowid;
                data['field'] = statement.row.field;
                data['value'] = statement.row.value;
                data['operator'] = statement.row.operator;
                data['folder'] = statement.row.folder;
            }
        } finally {
            statement.reset();
        }

        this.cache[cache_id] = data;

        return data;
    },
    dbInsertRule: function (field, value, folder, operator) {

        if (!field) {
            return false;
        }

        if (!value) {
            return false;
        }

        if (!folder) {
            return false;
        }

        if (!operator) {
            operator = '=';
        }

        let sql = "INSERT INTO rules VALUES (:field, :operator, :value, :folder)";
        let statement = this.dbConnection.createStatement(sql);

        statement.params.field = field;
        statement.params.operator = operator;
        statement.params.value = value;
        statement.params.folder = folder;

        try {
            statement.step();
        } finally {
            statement.reset();
        }

        this.clearCache();
    },
    dbUpdateRule: function (field, value, folder, operator, id) {

        if (!field) {
            return false;
        }

        if (!value) {
            return false;
        }

        if (!folder) {
            return false;
        }

        if (!operator) {
            operator = '=';
        }

        if (!id) {
            return false;
        }

        let sql = "UPDATE rules SET field = :field, operator = :operator, value = :value, folder = :folder WHERE rowid = :id";
        let statement = this.dbConnection.createStatement(sql);

        statement.params.field = field;
        statement.params.operator = operator;
        statement.params.value = value;
        statement.params.folder = folder;
        statement.params.id = id;

        try {
            statement.step();
        } finally {
            statement.reset();
        }

        this.clearCache();
    },
    dbRemoveRule: function (id) {

        if (!id) {
            return false;
        }

        console.info("Removed role id " + id);

        let sql = "DELETE FROM rules WHERE rowid = :id";
        let statement = this.dbConnection.createStatement(sql);
        statement.params.id = id;

        try {
            statement.step();
        } finally {
            statement.reset();
        }

        this.clearCache();
    },
    resetDatabase: function () {

        let statement = this.dbConnection.createStatement("DELETE FROM rules");
        try {
            statement.step();
        } finally {
            statement.reset();
        }

        this.clearCache();
    },
    cleanupDatabase: function () {

        // clean up broken rules (empty values)
        // there exists a bug where rules where created with empty value
        // which leds to incorrect rule compiling
        // (all mails got the same destination folder displayed)
        // this will clean it up

        let statement = this.dbConnection.createStatement(
            "DELETE FROM rules WHERE value='';");
        try {
            statement.step();
        } finally {
            statement.reset();
        }

        // Check for duplicate rules and delete them
        // Earlier versions might have created duplicate rules.
        // Clean them up.

        let statement_duplicates = this.dbConnection.createStatement(
            "select *, count(field) as num from rules group by field, operator, folder, value;");
        try {
            while (statement_duplicates.step()) {

                if (statement_duplicates.row.num > 1) {

                    let statement_details = this.dbConnection.createStatement(
                        "SELECT rowid,* from rules where field=:field AND operator=:operator AND folder=:folder AND value=:value");

                    statement_details.params.field = statement_duplicates.row.field;
                    statement_details.params.operator = statement_duplicates.row.operator;
                    statement_details.params.folder = statement_duplicates.row.folder;
                    statement_details.params.value = statement_duplicates.row.value;

                    try {
                        let i = 0;
                        while (statement_details.step()) {
                            console.debug(statement_details.row);

                            if (i > 0) {

                                // delete duplicate rule

                                let statement_delete = this.dbConnection.createStatement(
                                    "DELETE FROM rules WHERE rowid=:id;");
                                statement_delete.params.id = statement_details.row.rowid;

                                console.info("Delete duplicate rule " + statement_details.row.rowid)
                                try {
                                    statement_delete.step();
                                } finally {
                                    statement_delete.reset();
                                }

                            }

                            i++;
                        }
                    } finally {
                        statement_details.reset();
                    }
                }
            }

        } finally {
            statement_duplicates.reset();
        }


        this.clearCache();
    },
    clearCache: function () {
        this.cache = {};
    },
};
