## Iron Forge Events

Iron Forge Events is a full-stack event manager built with Node.js, Express, EJS (server-side rendered pages), and SQLite. It provides an organiser dashboard to create, edit, publish, and delete events, configure the site name/description, and manage ticket quantities/prices for full-price and student tickets. Attendees can browse upcoming published events, view event details, book tickets with name/email validation, and cancel bookings; a “My Booking” lookup page lets users retrieve booking details by reference and email.

### Run

- `npm install`
- `npm run build-db`
- `npm run start`

Open:
- `http://localhost:3000/` (Main Home Page)
- `http://localhost:3000/organiser` (Organiser Home Page)
- `http://localhost:3000/attendee` (Attendee Home Page)

### Notes

- Database schema is defined in `db_schema.sql` and created by `npm run build-db` (delete and rebuild with `npm run clean-db` then `npm run build-db`).
- Bookings require name + email, prevent double-booking per event, and support cancellation.
- Styling is plain CSS in `public/main.css` (no bundlers).
