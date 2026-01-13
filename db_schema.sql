
-- This makes sure that foreign_key constraints are observed and that errors will be thrown for violations
PRAGMA foreign_keys=ON;

BEGIN TRANSACTION;

-- Create your tables with SQL commands here (watch out for slight syntactical differences with SQLite vs MySQL)

-- Stores the site name/description shown on organiser + attendee pages.
-- Inputs: name, description
-- Outputs: a single settings row (id = 1)
CREATE TABLE IF NOT EXISTS site_settings (
    settings_id INTEGER PRIMARY KEY CHECK (settings_id = 1),
    site_name TEXT NOT NULL,
    site_description TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Stores events created by the organiser.
-- Inputs: title, description, datetime, ticket totals/prices, state
-- Outputs: events available for publishing and booking
CREATE TABLE IF NOT EXISTS events (
    event_id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    event_datetime TEXT NOT NULL, -- ISO-like string, e.g. 2026-01-12T18:30
    state TEXT NOT NULL CHECK (state IN ('draft', 'published')) DEFAULT 'draft',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    published_at TEXT,
    full_ticket_total INTEGER NOT NULL DEFAULT 0 CHECK (full_ticket_total >= 0),
    full_ticket_price_cents INTEGER NOT NULL DEFAULT 0 CHECK (full_ticket_price_cents >= 0),
    concession_ticket_total INTEGER NOT NULL DEFAULT 0 CHECK (concession_ticket_total >= 0),
    concession_ticket_price_cents INTEGER NOT NULL DEFAULT 0 CHECK (concession_ticket_price_cents >= 0)
);

CREATE INDEX IF NOT EXISTS idx_events_state_datetime ON events(state, event_datetime);

-- Stores attendee bookings for events.
-- Inputs: attendee name/email, ticket quantities
-- Outputs: booking records used to calculate remaining availability
CREATE TABLE IF NOT EXISTS bookings (
    booking_id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    attendee_name TEXT NOT NULL,
    attendee_email TEXT NOT NULL,
    full_qty INTEGER NOT NULL DEFAULT 0 CHECK (full_qty >= 0),
    concession_qty INTEGER NOT NULL DEFAULT 0 CHECK (concession_qty >= 0),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    cancelled_at TEXT,
    FOREIGN KEY (event_id) REFERENCES events(event_id) ON DELETE CASCADE,
    UNIQUE (event_id, attendee_email, is_active)
);

-- START: related docs (constraints + foreign keys)
-- SQLite foreign keys: https://www.sqlite.org/foreignkeys.html
-- SQLite CREATE TABLE + UNIQUE: https://www.sqlite.org/lang_createtable.html
-- END: related docs

CREATE INDEX IF NOT EXISTS idx_bookings_event_active ON bookings(event_id, is_active);

-- Insert default data (if necessary here)
INSERT OR IGNORE INTO site_settings (settings_id, site_name, site_description)
VALUES (1, 'Iron Forge Lifting', 'Weight lifting sessions for all levels.');

COMMIT;
