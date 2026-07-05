-- DataVista 2026 advanced DBMS features for HaemoLink (PostgreSQL)
-- Includes:
-- 1) Trigger
-- 2) Stored procedures (2+)
-- 3) Cursor-based row-by-row processing
-- 4) Transaction (canned transaction example)

-- Optional helper table for audit trail
CREATE TABLE IF NOT EXISTS inventory_audit (
    id BIGSERIAL PRIMARY KEY,
    inventory_id VARCHAR(40) NOT NULL,
    old_status VARCHAR(20),
    new_status VARCHAR(20) NOT NULL,
    changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =========================================================
-- TRIGGER: auto-log status changes in inventory
-- =========================================================
CREATE OR REPLACE FUNCTION fn_log_inventory_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
        INSERT INTO inventory_audit (inventory_id, old_status, new_status, changed_at)
        VALUES (OLD.id, OLD.status, NEW.status, CURRENT_TIMESTAMP);

        INSERT INTO activity_log (id, event_time, message, type)
        VALUES (
            'a' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10),
            to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI'),
            'Inventory status changed for ' || OLD.id || ': ' || OLD.status || ' -> ' || NEW.status,
            'info'
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_inventory_status_change ON inventory;
CREATE TRIGGER trg_inventory_status_change
AFTER UPDATE OF status ON inventory
FOR EACH ROW
EXECUTE FUNCTION fn_log_inventory_status_change();

-- =========================================================
-- STORED PROCEDURE 1:
-- mark expired units and log count
-- =========================================================
CREATE OR REPLACE PROCEDURE sp_mark_expired_inventory()
LANGUAGE plpgsql
AS $$
DECLARE
    v_count INT := 0;
BEGIN
    UPDATE inventory
    SET status = 'Expired'
    WHERE status = 'Available'
      AND expiry_date < CURRENT_DATE;

    GET DIAGNOSTICS v_count = ROW_COUNT;

    INSERT INTO activity_log (id, event_time, message, type)
    VALUES (
        'a' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10),
        to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI'),
        'Expired inventory update completed. Units changed: ' || v_count,
        'info'
    );
END;
$$;

-- =========================================================
-- STORED PROCEDURE 2:
-- create blood request with transaction-safe local allocation
-- =========================================================
CREATE OR REPLACE PROCEDURE sp_submit_blood_request(
    IN p_request_id VARCHAR(40),
    IN p_hospital_id VARCHAR(40),
    IN p_blood_type VARCHAR(5),
    IN p_quantity INT,
    IN p_urgency VARCHAR(20),
    IN p_notes VARCHAR(255)
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_available INT := 0;
BEGIN
    SELECT COUNT(*)
      INTO v_available
      FROM inventory
     WHERE hospital_id = p_hospital_id
       AND blood_type = p_blood_type
       AND status = 'Available'
       AND expiry_date >= CURRENT_DATE;

    INSERT INTO blood_requests (
        id, hospital_id, blood_type, quantity, urgency, status, notes, created_at, fulfilled_at
    ) VALUES (
        p_request_id,
        p_hospital_id,
        p_blood_type,
        p_quantity,
        COALESCE(p_urgency, 'Medium'),
        CASE WHEN v_available >= p_quantity THEN 'Fulfilled' ELSE 'Pending' END,
        p_notes,
        CURRENT_DATE,
        CASE WHEN v_available >= p_quantity THEN CURRENT_DATE ELSE NULL END
    );

    IF v_available >= p_quantity THEN
        UPDATE inventory
           SET status = 'Reserved'
         WHERE id IN (
             SELECT id
               FROM inventory
              WHERE hospital_id = p_hospital_id
                AND blood_type = p_blood_type
                AND status = 'Available'
                AND expiry_date >= CURRENT_DATE
              ORDER BY expiry_date ASC
              LIMIT p_quantity
         );
    END IF;
END;
$$;

-- =========================================================
-- CURSOR DEMO:
-- Generate per-hospital blood availability snapshot into activity_log
-- =========================================================
CREATE OR REPLACE PROCEDURE sp_log_hospital_stock_snapshot()
LANGUAGE plpgsql
AS $$
DECLARE
    rec RECORD;
    cur_hospitals CURSOR FOR
        SELECT h.id, h.name
          FROM hospitals h
         ORDER BY h.id;
    v_count INT;
BEGIN
    OPEN cur_hospitals;
    LOOP
        FETCH cur_hospitals INTO rec;
        EXIT WHEN NOT FOUND;

        SELECT COUNT(*)
          INTO v_count
          FROM inventory i
         WHERE i.hospital_id = rec.id
           AND i.status = 'Available'
           AND i.expiry_date >= CURRENT_DATE;

        INSERT INTO activity_log (id, event_time, message, type)
        VALUES (
            'a' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10),
            to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI'),
            'Stock snapshot - ' || rec.name || ': ' || v_count || ' available units',
            'info'
        );
    END LOOP;
    CLOSE cur_hospitals;
END;
$$;

-- =========================================================
-- CANNED TRANSACTION EXAMPLE (manual run block)
-- =========================================================
-- BEGIN;
-- CALL sp_submit_blood_request('req_txn_001', 'h1', 'O-', 1, 'High', 'Txn demo request');
-- CALL sp_mark_expired_inventory();
-- COMMIT;
--
-- If any step fails:
-- ROLLBACK;
