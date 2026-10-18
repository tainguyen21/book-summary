-- Live status: every processing event the worker records wakes the API, which
-- pushes the book's new status to the owner's open pages (server-sent events).
-- The payload carries ids only; listeners re-read status with owner scoping.
CREATE FUNCTION data.notify_book_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    PERFORM pg_notify(
        'bookwise_book_status',
        json_build_object('owner_id', NEW.owner_id, 'book_id', NEW.book_id)::text
    );
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_data_processing_events_notify
    AFTER INSERT ON data.processing_events
    FOR EACH ROW
    EXECUTE FUNCTION data.notify_book_status();
