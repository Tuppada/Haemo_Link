CREATE TABLE users (
    id VARCHAR(40) PRIMARY KEY,
    email VARCHAR(120) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL,
    hospital_id VARCHAR(40),
    name VARCHAR(120) NOT NULL,
    created_at DATE NOT NULL
);

CREATE TABLE hospitals (
    id VARCHAR(40) PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    location VARCHAR(120) NOT NULL,
    contact VARCHAR(120) NOT NULL,
    phone VARCHAR(20) NOT NULL
);

CREATE TABLE donors (
    id VARCHAR(40) PRIMARY KEY,
    user_id VARCHAR(40),
    name VARCHAR(120) NOT NULL,
    email VARCHAR(120) NOT NULL,
    blood_type VARCHAR(5) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    dob DATE,
    last_donation DATE,
    medical_clearance BOOLEAN NOT NULL DEFAULT TRUE,
    address VARCHAR(255),
    emergency_contact VARCHAR(20),
    status VARCHAR(20) NOT NULL DEFAULT 'Active',
    CONSTRAINT fk_donor_user FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE inventory (
    id VARCHAR(40) PRIMARY KEY,
    blood_type VARCHAR(5) NOT NULL,
    collection_date DATE NOT NULL,
    expiry_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'Available',
    donor_id VARCHAR(40),
    hospital_id VARCHAR(40) NOT NULL,
    CONSTRAINT fk_inventory_donor FOREIGN KEY (donor_id) REFERENCES donors(id),
    CONSTRAINT fk_inventory_hospital FOREIGN KEY (hospital_id) REFERENCES hospitals(id)
);

CREATE TABLE blood_requests (
    id VARCHAR(40) PRIMARY KEY,
    hospital_id VARCHAR(40) NOT NULL,
    blood_type VARCHAR(5) NOT NULL,
    quantity INT NOT NULL,
    urgency VARCHAR(20) NOT NULL DEFAULT 'Medium',
    status VARCHAR(20) NOT NULL DEFAULT 'Pending',
    notes VARCHAR(255),
    created_at DATE NOT NULL,
    fulfilled_at DATE,
    CONSTRAINT fk_request_hospital FOREIGN KEY (hospital_id) REFERENCES hospitals(id)
);

CREATE TABLE activity_log (
    id VARCHAR(40) PRIMARY KEY,
    event_time VARCHAR(40) NOT NULL,
    message VARCHAR(255) NOT NULL,
    type VARCHAR(20) NOT NULL
);

CREATE TABLE organ_donors (
    id VARCHAR(40) PRIMARY KEY,
    donor_id VARCHAR(40),
    name VARCHAR(120) NOT NULL,
    blood_type VARCHAR(5) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    organs VARCHAR(500) NOT NULL,
    hospital_id VARCHAR(40),
    registered_at DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'Active',
    notes VARCHAR(500),
    CONSTRAINT fk_organ_donor FOREIGN KEY (donor_id) REFERENCES donors(id),
    CONSTRAINT fk_organ_hospital FOREIGN KEY (hospital_id) REFERENCES hospitals(id)
);

CREATE TABLE hospital_edges (
    from_hospital_id VARCHAR(40) NOT NULL,
    to_hospital_id VARCHAR(40) NOT NULL,
    distance_km INT NOT NULL,
    PRIMARY KEY (from_hospital_id, to_hospital_id),
    CONSTRAINT fk_edge_from FOREIGN KEY (from_hospital_id) REFERENCES hospitals(id),
    CONSTRAINT fk_edge_to FOREIGN KEY (to_hospital_id) REFERENCES hospitals(id)
);

CREATE TABLE hospital_blood_capacity (
    hospital_id VARCHAR(40) NOT NULL,
    blood_type VARCHAR(5) NOT NULL,
    target_units INT NOT NULL,
    PRIMARY KEY (hospital_id, blood_type),
    CONSTRAINT fk_capacity_hospital FOREIGN KEY (hospital_id) REFERENCES hospitals(id)
);

CREATE TABLE appointments (
    id VARCHAR(40) PRIMARY KEY,
    user_id VARCHAR(40) NOT NULL,
    hospital_id VARCHAR(40) NOT NULL,
    donation_type VARCHAR(20) NOT NULL DEFAULT 'Blood',
    appointment_date DATE NOT NULL,
    notes VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'Scheduled',
    booked_at DATE NOT NULL,
    CONSTRAINT fk_appointment_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT fk_appointment_hospital FOREIGN KEY (hospital_id) REFERENCES hospitals(id)
);
