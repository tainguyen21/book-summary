GRANT USAGE ON SCHEMA data TO data_rw;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA data TO data_rw;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA data TO data_rw;

GRANT USAGE ON SCHEMA app TO data_rw;
GRANT SELECT ON app.books, app.book_objects, app.processing_commands TO data_rw;
