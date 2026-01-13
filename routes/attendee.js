// attendee.js
// Attendee pages (browse published events, book tickets, cancel booking)
// Tip: with sqlite3 it's usually nicer to avoid arrow functions in callbacks

const express = require("express");
const router = express.Router();

function formatMoney(cents) {
    return `£${(cents / 100).toFixed(2)}`;
}

function formatEventDate(dateTimeLocalString) {
    const date = new Date(dateTimeLocalString);
    if (Number.isNaN(date.getTime())) return dateTimeLocalString;
    return date.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function parseNonNegativeInt(value) {
    const parsed = Number.parseInt(`${value}`, 10);
    if (Number.isNaN(parsed) || parsed < 0) return null;
    return parsed;
}

function isValidEmail(email) {
    // START: related docs (email pattern idea)
    // HTML email inputs + simple regex checks are common; see MDN "input type=email"
    // END: related docs
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getSiteSettings(callback) {
    const settingsQuery = "SELECT site_name, site_description FROM site_settings WHERE settings_id = 1;";

    // DB: load settings
    global.db.get(settingsQuery, function (err, row) {
        if (err) return callback(err);
        callback(null, row || { site_name: "Iron Forge", site_description: "Describe your events here." });
    });
}

function getPublishedEvents(callback) {
    const eventsQuery = `
        SELECT
            e.event_id,
            e.title,
            e.event_datetime
        FROM events e
        WHERE e.state = 'published'
        ORDER BY e.event_datetime ASC;
    `;

    // DB: list published events
    global.db.all(eventsQuery, function (err, rows) {
        callback(err, rows || []);
    });
}

function getEventWithAvailability(eventId, callback) {
    const query = `
        SELECT
            e.*,
            COALESCE(SUM(CASE WHEN b.is_active = 1 THEN b.full_qty ELSE 0 END), 0) AS full_sold,
            COALESCE(SUM(CASE WHEN b.is_active = 1 THEN b.concession_qty ELSE 0 END), 0) AS concession_sold
        FROM events e
        LEFT JOIN bookings b ON b.event_id = e.event_id
        WHERE e.event_id = ? AND e.state = 'published'
        GROUP BY e.event_id;
    `;

    // DB: load one published event + how many tickets are sold
    global.db.get(query, [eventId], function (err, row) {
        if (err) return callback(err);
        if (!row) return callback(null, null);

        const fullRemaining = Math.max(0, row.full_ticket_total - row.full_sold);
        const concessionRemaining = Math.max(0, row.concession_ticket_total - row.concession_sold);

        callback(null, {
            ...row,
            full_remaining: fullRemaining,
            concession_remaining: concessionRemaining,
            full_price_display: formatMoney(row.full_ticket_price_cents),
            concession_price_display: formatMoney(row.concession_ticket_price_cents),
            event_date_display: formatEventDate(row.event_datetime),
        });
    });
}

// START: My Booking feature (docs used)
// Express routing: https://expressjs.com/en/guide/routing.html
// body-parser urlencoded (form posts): https://www.npmjs.com/package/body-parser
// sqlite3 `db.get` (single row queries): https://www.npmjs.com/package/sqlite3
// SQLite SELECT + JOIN syntax: https://www.sqlite.org/lang_select.html
// END: My Booking feature (docs used)

// GET /attendee/my-booking - show booking lookup form
router.get("/my-booking", function (req, res, next) {
    getSiteSettings(function (err, site) {
        if (err) return next(err);
        res.render("attendee-my-booking.ejs", {
            site,
            error: null,
            booking: null,
        });
    });
});

// POST /attendee/my-booking - look up a booking by id + email
router.post("/my-booking", function (req, res, next) {
    const bookingId = parseNonNegativeInt(req.body.booking_id);
    const attendeeEmail = `${req.body.attendee_email || ""}`.trim().toLowerCase();

    getSiteSettings(function (err, site) {
        if (err) return next(err);

        if (bookingId === null || !attendeeEmail || !isValidEmail(attendeeEmail)) {
            return res.status(400).render("attendee-my-booking.ejs", {
                site,
                error: "Please enter a valid booking reference and email address.",
                booking: null,
            });
        }

        const query = `
            SELECT
                b.*,
                e.title AS event_title,
                e.event_datetime AS event_datetime,
                e.full_ticket_price_cents AS full_ticket_price_cents,
                e.concession_ticket_price_cents AS concession_ticket_price_cents
            FROM bookings b
            JOIN events e ON e.event_id = b.event_id
            WHERE b.booking_id = ? AND b.attendee_email = ?;
        `;
        const parameters = [bookingId, attendeeEmail];

        // DB: load one booking (with event details)
        global.db.get(query, parameters, function (err2, row) {
            if (err2) return next(err2);
            if (!row) {
                return res.status(404).render("attendee-my-booking.ejs", {
                    site,
                    error: "Booking not found. Check your reference and email.",
                    booking: null,
                });
            }

            const totalCents =
                row.full_qty * row.full_ticket_price_cents + row.concession_qty * row.concession_ticket_price_cents;

            res.render("attendee-my-booking.ejs", {
                site,
                error: null,
                booking: {
                    ...row,
                    event_date_display: formatEventDate(row.event_datetime),
                    total_display: formatMoney(totalCents),
                },
            });
        });
    });
});

// START: My Booking feature (docs used)
// END: My Booking feature (docs used)

// GET /attendee - attendee home (list published events)
router.get("/", function (req, res, next) {
    getSiteSettings(function (err, site) {
        if (err) return next(err);

        getPublishedEvents(function (err2, events) {
            if (err2) return next(err2);
            res.render("attendee-home.ejs", {
                site,
                events: events.map(function (event) {
                    return {
                        ...event,
                        event_date_display: formatEventDate(event.event_datetime),
                    };
                }),
            });
        });
    });
});

// GET /attendee/events/:eventId - show one event and the booking form
router.get("/events/:eventId", function (req, res, next) {
    const eventId = parseNonNegativeInt(req.params.eventId);
    if (eventId === null) return res.status(400).send("Invalid event id.");

    getSiteSettings(function (err, site) {
        if (err) return next(err);

        getEventWithAvailability(eventId, function (err2, event) {
            if (err2) return next(err2);
            if (!event) return res.status(404).send("Event not found.");

            const bookingId = parseNonNegativeInt(req.query.bookingId);
            const bookingEmail = `${req.query.email || ""}`.trim();

            if (bookingId === null || !bookingEmail) {
                return res.render("attendee-event.ejs", {
                    site,
                    event,
                    error: null,
                    info: req.query.cancelled ? "Booking cancelled." : null,
                    booking: null,
                });
            }

            const bookingQuery =
                "SELECT * FROM bookings WHERE booking_id = ? AND attendee_email = ? AND event_id = ?;";

            // DB: load booking so the page can show the reference + cancel button
            global.db.get(bookingQuery, [bookingId, bookingEmail, eventId], function (err3, bookingRow) {
                if (err3) return next(err3);

                res.render("attendee-event.ejs", {
                    site,
                    event,
                    error: null,
                    info: null,
                    booking: bookingRow || null,
                });
            });
        });
    });
});

// POST /attendee/events/:eventId/book - book tickets
router.post("/events/:eventId/book", function (req, res, next) {
    // START: related docs (Express POST routes)
    // Express routing: https://expressjs.com/en/guide/routing.html
    // END: related docs
    const eventId = parseNonNegativeInt(req.params.eventId);
    if (eventId === null) return res.status(400).send("Invalid event id.");

    const attendeeName = `${req.body.attendee_name || ""}`.trim();
    const attendeeEmail = `${req.body.attendee_email || ""}`.trim().toLowerCase();
    const fullQty = parseNonNegativeInt(req.body.full_qty) ?? 0;
    const concessionQty = parseNonNegativeInt(req.body.concession_qty) ?? 0;

    getSiteSettings(function (err, site) {
        if (err) return next(err);

        getEventWithAvailability(eventId, function (err2, event) {
            if (err2) return next(err2);
            if (!event) return res.status(404).send("Event not found.");

            if (!attendeeName || !attendeeEmail || !isValidEmail(attendeeEmail)) {
                return res.status(400).render("attendee-event.ejs", {
                    site,
                    event,
                    error: "Please enter a valid name and email address.",
                    info: null,
                    booking: null,
                });
            }

            if (fullQty + concessionQty <= 0) {
                return res.status(400).render("attendee-event.ejs", {
                    site,
                    event,
                    error: "Please select at least one ticket.",
                    info: null,
                    booking: null,
                });
            }

            if (fullQty > event.full_remaining || concessionQty > event.concession_remaining) {
                return res.status(400).render("attendee-event.ejs", {
                    site,
                    event,
                    error: "Not enough tickets available for your selection.",
                    info: null,
                    booking: null,
                });
            }

            const existingBookingQuery =
                "SELECT booking_id FROM bookings WHERE event_id = ? AND attendee_email = ? AND is_active = 1;";

            // START: related docs (sqlite3 get + avoiding double booking)
            // sqlite3 `db.get`: https://www.npmjs.com/package/sqlite3
            // SQLite UNIQUE constraints (also enforced in the schema): https://www.sqlite.org/lang_createtable.html
            // END: related docs
            // DB: block double booking (same email + same event)
            global.db.get(existingBookingQuery, [eventId, attendeeEmail], function (err3, existingRow) {
                if (err3) return next(err3);
                if (existingRow) {
                    return res.status(400).render("attendee-event.ejs", {
                        site,
                        event,
                        error: "This email address already has an active booking for this event.",
                        info: null,
                        booking: null,
                    });
                }

                const insertQuery = `
                    INSERT INTO bookings (
                        event_id,
                        attendee_name,
                        attendee_email,
                        full_qty,
                        concession_qty
                    ) VALUES (?, ?, ?, ?, ?);
                `;
                const parameters = [eventId, attendeeName, attendeeEmail, fullQty, concessionQty];

                // DB: create booking
                global.db.run(insertQuery, parameters, function (err4) {
                    if (err4) return next(err4);
                    res.redirect(`/attendee/events/${eventId}?bookingId=${this.lastID}&email=${encodeURIComponent(attendeeEmail)}`);
                });
            });
        });
    });
});

// POST /attendee/bookings/:bookingId/cancel - cancel a booking
router.post("/bookings/:bookingId/cancel", function (req, res, next) {
    const bookingId = parseNonNegativeInt(req.params.bookingId);
    const attendeeEmail = `${req.body.attendee_email || ""}`.trim().toLowerCase();
    const eventId = parseNonNegativeInt(req.body.event_id);

    if (bookingId === null || !attendeeEmail || !isValidEmail(attendeeEmail) || eventId === null) {
        return res.status(400).send("Invalid cancellation request.");
    }

    const query = `
        UPDATE bookings
        SET is_active = 0, cancelled_at = datetime('now')
        WHERE booking_id = ? AND attendee_email = ? AND event_id = ? AND is_active = 1;
    `;
    const parameters = [bookingId, attendeeEmail, eventId];

    // DB: mark booking as cancelled
    global.db.run(query, parameters, function (err) {
        if (err) return next(err);
        res.redirect(`/attendee/events/${eventId}?cancelled=1`);
    });
});

module.exports = router;
