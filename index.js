// index.js
// Main server entry point

// Express + EJS setup
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;
var bodyParser = require("body-parser");
app.use(bodyParser.urlencoded({ extended: true }));
app.set('view engine', 'ejs'); // set the app to use ejs for rendering
app.use(express.static(__dirname + '/public')); // set location of static files

// SQLite setup (global.db is used in routes)
const sqlite3 = require('sqlite3').verbose();
global.db = new sqlite3.Database('./database.db',function(err){
    if(err){
        console.error(err);
        process.exit(1); // stop if the DB can't be opened
    } else {
        console.log("Database connected");
        global.db.run("PRAGMA foreign_keys=ON"); // tell SQLite to pay attention to foreign key constraints
    }
});

// Close DB on shutdown so the file doesn't stay locked
function shutdown() {
    if (!global.db) process.exit(0);
    global.db.close(function (err) {
        if (err) console.error(err);
        process.exit(0);
    });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// GET / - basic home page with links
app.get('/', (req, res) => {
    res.render('home.ejs');
});

// App routes
const organiserRoutes = require('./routes/organiser');
app.use('/organiser', organiserRoutes);

const attendeeRoutes = require('./routes/attendee');
app.use('/attendee', attendeeRoutes);

// Basic error page
app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).render('error.ejs', {
        message: err.message || 'Unexpected error',
    });
});

// Start server
const server = app.listen(port, () => {
    console.log(`App listening on port ${port}`);
});

// If the port is already being used, show a simple message
server.on("error", function (err) {
    if (err && err.code === "EADDRINUSE") {
        console.error(`Port ${port} is already in use. Stop the other server or set PORT to a different value.`);
        process.exit(1);
    }
    throw err;
});
