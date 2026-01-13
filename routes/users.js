// users.js
// Example routes (kept from the template)


const express = require("express");
const router = express.Router();

// GET /users/list-users - list users as JSON
router.get("/list-users", (req, res, next) => {
    // DB: get all users
    const query = "SELECT * FROM users";

    global.db.all(query, 
        function (err, rows) {
            if (err) {
                next(err); //send the error on to the error handler
            } else {
                res.json(rows); // render page as simple json
            }
        }
    );
});

// GET /users/add-user - show the add user form
router.get("/add-user", (req, res) => {
    res.render("add-user.ejs");
});

// POST /users/add-user - create a user from the form
router.post("/add-user", (req, res, next) => {
    // DB: insert one user
    const query = "INSERT INTO users (user_name) VALUES( ? );";
    const query_parameters = [req.body.user_name];
    
    global.db.run(query, query_parameters,
        function (err) {
            if (err) {
                next(err); //send the error on to the error handler
            } else {
                res.send(`New data inserted @ id ${this.lastID}!`);
            }
        }
    );
});

// Export router
module.exports = router;
