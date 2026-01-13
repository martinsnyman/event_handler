// scripts/build-db.js
// Builds `database.db` by running `db_schema.sql`
// This avoids needing the sqlite3 CLI installed

const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const projectRoot = path.join(__dirname, "..");
const schemaPath = path.join(projectRoot, "db_schema.sql");
const dbPath = path.join(projectRoot, "database.db");

function main() {
    // START: related docs (running a schema file)
    // sqlite3 `db.exec` runs a big SQL string: https://www.npmjs.com/package/sqlite3
    // Node fs.readFileSync: https://nodejs.org/api/fs.html
    // END: related docs
    const schemaSql = fs.readFileSync(schemaPath, "utf8");

    if (fs.existsSync(dbPath)) {
        try {
            fs.unlinkSync(dbPath);
        } catch (err) {
            if (err && err.code === "EBUSY") {
                console.error("database.db is busy/locked. Stop the server (npm run start) and try again.");
                process.exit(1);
            }
            throw err;
        }
    }

    const db = new sqlite3.Database(dbPath);

    db.exec(schemaSql, function (err) {
        if (err) {
            console.error("Failed to build database:", err.message);
            db.close(function () {
                process.exit(1);
            });
            return;
        }

        db.close(function (closeErr) {
            if (closeErr) {
                console.error("Failed to close database:", closeErr.message);
                process.exit(1);
                return;
            }
            console.log("Database built successfully:", dbPath);
        });
    });
}

main();
