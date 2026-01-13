// organiser.js
// Organiser pages (create/edit/publish/delete events + site settings)
// Tip: with sqlite3 it's usually nicer to avoid arrow functions in callbacks

const express = require("express");
const router = express.Router();

function formatMoney(cents) {
    return `£${(cents / 100).toFixed(2)}`;
}

function toDatetimeLocalString(date) {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    const hours = `${date.getHours()}`.padStart(2, "0");
    const minutes = `${date.getMinutes()}`.padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function defaultEventDatetime() {
    const date = new Date();
    date.setDate(date.getDate() + 7);
    date.setHours(18, 0, 0, 0);
    return toDatetimeLocalString(date);
}

function parseNonNegativeInt(value) {
    const parsed = Number.parseInt(`${value}`, 10);
    if (Number.isNaN(parsed) || parsed < 0) return null;
    return parsed;
}

function parseNonNegativeMoneyToCents(value) {
    const parsed = Number.parseFloat(`${value}`);
    if (Number.isNaN(parsed) || parsed < 0) return null;
    return Math.round(parsed * 100);
}

// GET /organiser - organiser dashboard (draft + published lists)
router.get("/", function (req, res, next) {
    const settingsQuery = "SELECT site_name, site_description FROM site_settings WHERE settings_id = 1;";
    const eventsQuery = `
        SELECT
            e.event_id,
            e.title,
            e.description,
            e.event_datetime,
            e.state,
            e.created_at,
            e.updated_at,
            e.published_at,
            e.full_ticket_total,
            e.full_ticket_price_cents,
            e.concession_ticket_total,
            e.concession_ticket_price_cents,
            COALESCE(SUM(CASE WHEN b.is_active = 1 THEN b.full_qty ELSE 0 END), 0) AS full_sold,
            COALESCE(SUM(CASE WHEN b.is_active = 1 THEN b.concession_qty ELSE 0 END), 0) AS concession_sold
        FROM events e
        LEFT JOIN bookings b ON b.event_id = e.event_id
        WHERE e.state = ?
        GROUP BY e.event_id
        ORDER BY e.event_datetime ASC, e.created_at DESC;
    `;

    // DB: load site settings
    global.db.get(settingsQuery, function (err, settingsRow) {
        if (err) return next(err);
        const site = settingsRow || { site_name: "Iron Forge", site_description: "Describe your events here." };

        // DB: load published events
        global.db.all(eventsQuery, ["published"], function (err2, publishedRows) {
            if (err2) return next(err2);

            // DB: load draft events
            global.db.all(eventsQuery, ["draft"], function (err3, draftRows) {
                if (err3) return next(err3);

                function enrichEvent(row) {
                    return {
                        ...row,
                        full_remaining: Math.max(0, row.full_ticket_total - row.full_sold),
                        concession_remaining: Math.max(0, row.concession_ticket_total - row.concession_sold),
                        full_price_display: formatMoney(row.full_ticket_price_cents),
                        concession_price_display: formatMoney(row.concession_ticket_price_cents),
                    };
                }

                res.render("organiser-home.ejs", {
                    site,
                    publishedEvents: publishedRows.map(enrichEvent),
                    draftEvents: draftRows.map(enrichEvent),
                });
            });
        });
    });
});

// POST /organiser/events/new - create a draft event then open edit page
router.post("/events/new", function (req, res, next) {
    const insertQuery = `
        INSERT INTO events (
            title,
            description,
            event_datetime,
            state,
            full_ticket_total,
            full_ticket_price_cents,
            concession_ticket_total,
            concession_ticket_price_cents
        ) VALUES (?, ?, ?, 'draft', 0, 0, 0, 0);
    `;
    const insertParameters = ["Untitled event", "", defaultEventDatetime()];

    // DB: create draft event
    global.db.run(insertQuery, insertParameters, function (err) {
        if (err) return next(err);
        res.redirect(`/organiser/events/${this.lastID}/edit`);
    });
});

// GET /organiser/settings - show settings form
router.get("/settings", function (req, res, next) {
    const query = "SELECT site_name, site_description FROM site_settings WHERE settings_id = 1;";

    // DB: load settings
    global.db.get(query, function (err, row) {
        if (err) return next(err);
        res.render("organiser-settings.ejs", {
            site: row || { site_name: "Iron Forge", site_description: "Describe your events here." },
            error: null,
        });
    });
});

// POST /organiser/settings - save settings then go back to organiser home
router.post("/settings", function (req, res, next) {
    const siteName = `${req.body.site_name || ""}`.trim();
    const siteDescription = `${req.body.site_description || ""}`.trim();

    if (!siteName || !siteDescription) {
        return res.status(400).render("organiser-settings.ejs", {
            site: { site_name: siteName, site_description: siteDescription },
            error: "Please complete all fields.",
        });
    }

    const query = `
        INSERT INTO site_settings (settings_id, site_name, site_description, updated_at)
        VALUES (1, ?, ?, datetime('now'))
        ON CONFLICT(settings_id) DO UPDATE SET
            site_name = excluded.site_name,
            site_description = excluded.site_description,
            updated_at = excluded.updated_at;
    `;
    const parameters = [siteName, siteDescription];

    // START: related docs (SQLite UPSERT)
    // SQLite "ON CONFLICT ... DO UPDATE" (upsert): https://www.sqlite.org/lang_UPSERT.html
    // END: related docs
    
    // DB: upsert settings row
    global.db.run(query, parameters, function (err) {
        if (err) return next(err);
        res.redirect("/organiser");
    });
});

// GET /organiser/events/:eventId/edit - show edit form for one event
router.get("/events/:eventId/edit", function (req, res, next) {
    const eventId = parseNonNegativeInt(req.params.eventId);
    if (eventId === null) return res.status(400).send("Invalid event id.");

    const query = "SELECT * FROM events WHERE event_id = ?;";

    // DB: load event by id
    global.db.get(query, [eventId], function (err, row) {
        if (err) return next(err);
        if (!row) return res.status(404).send("Event not found.");

        res.render("organiser-edit-event.ejs", {
            event: {
                ...row,
                full_ticket_price_display: (row.full_ticket_price_cents / 100).toFixed(2),
                concession_ticket_price_display: (row.concession_ticket_price_cents / 100).toFixed(2),
            },
            error: null,
        });
    });
});

// POST /organiser/events/:eventId/edit - save event changes
router.post("/events/:eventId/edit", function (req, res, next) {
    const eventId = parseNonNegativeInt(req.params.eventId);
    if (eventId === null) return res.status(400).send("Invalid event id.");

    const title = `${req.body.title || ""}`.trim();
    const description = `${req.body.description || ""}`.trim();
    const eventDatetime = `${req.body.event_datetime || ""}`.trim();

    const fullTicketTotal = parseNonNegativeInt(req.body.full_ticket_total);
    const fullTicketPriceCents = parseNonNegativeMoneyToCents(req.body.full_ticket_price);
    const concessionTicketTotal = parseNonNegativeInt(req.body.concession_ticket_total);
    const concessionTicketPriceCents = parseNonNegativeMoneyToCents(req.body.concession_ticket_price);

    if (
        !title ||
        !description ||
        !eventDatetime ||
        fullTicketTotal === null ||
        fullTicketPriceCents === null ||
        concessionTicketTotal === null ||
        concessionTicketPriceCents === null
    ) {
        return res.status(400).render("organiser-edit-event.ejs", {
            event: {
                event_id: eventId,
                title,
                description,
                event_datetime: eventDatetime,
                full_ticket_total: fullTicketTotal ?? 0,
                full_ticket_price_display: `${req.body.full_ticket_price || ""}`,
                concession_ticket_total: concessionTicketTotal ?? 0,
                concession_ticket_price_display: `${req.body.concession_ticket_price || ""}`,
                created_at: "",
                updated_at: "",
                published_at: null,
                state: "draft",
            },
            error: "Please complete all fields with valid values (non-negative numbers).",
        });
    }

    const query = `
        UPDATE events
        SET
            title = ?,
            description = ?,
            event_datetime = ?,
            full_ticket_total = ?,
            full_ticket_price_cents = ?,
            concession_ticket_total = ?,
            concession_ticket_price_cents = ?,
            updated_at = datetime('now')
        WHERE event_id = ?;
    `;
    const parameters = [
        title,
        description,
        eventDatetime,
        fullTicketTotal,
        fullTicketPriceCents,
        concessionTicketTotal,
        concessionTicketPriceCents,
        eventId,
    ];

    // DB: update event fields + updated_at
    global.db.run(query, parameters, function (err) {
        if (err) return next(err);
        res.redirect(`/organiser/events/${eventId}/edit`);
    });
});

// POST /organiser/events/:eventId/publish - publish a draft event
router.post("/events/:eventId/publish", function (req, res, next) {
    const eventId = parseNonNegativeInt(req.params.eventId);
    if (eventId === null) return res.status(400).send("Invalid event id.");

    const query = `
        UPDATE events
        SET state = 'published', published_at = datetime('now'), updated_at = datetime('now')
        WHERE event_id = ? AND state = 'draft';
    `;

    // DB: update state + published_at
    global.db.run(query, [eventId], function (err) {
        if (err) return next(err);
        res.redirect("/organiser");
    });
});

// POST /organiser/events/:eventId/delete - delete an event
router.post("/events/:eventId/delete", function (req, res, next) {
    const eventId = parseNonNegativeInt(req.params.eventId);
    if (eventId === null) return res.status(400).send("Invalid event id.");

    const query = "DELETE FROM events WHERE event_id = ?;";

    // DB: delete event (bookings cascade)
    global.db.run(query, [eventId], function (err) {
        if (err) return next(err);
        res.redirect("/organiser");
    });
});

module.exports = router;
