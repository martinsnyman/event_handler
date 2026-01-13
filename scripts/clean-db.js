// scripts/clean-db.js
// Deletes `database.db` if it exists

const fs = require("fs");
const path = require("path");

const dbPath = path.join(__dirname, "..", "database.db");

if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
    console.log("Deleted database:", dbPath);
} else {
    console.log("No database to delete:", dbPath);
}
