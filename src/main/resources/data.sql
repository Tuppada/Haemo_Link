INSERT INTO hospitals (id, name, location, contact, phone) VALUES
('h1', 'Manipal Hospital', 'Bengaluru, KA', 'Dr. Rajan', '080-25021111'),
('h2', 'Fortis Healthcare', 'Bengaluru, KA', 'Dr. Anita', '080-66214444'),
('h3', 'Apollo Hospitals', 'Chennai, TN', 'Dr. Suresh', '044-28290000'),
('h4', 'AIIMS Delhi', 'New Delhi, DL', 'Dr. Kapoor', '011-26588500'),
('h5', 'NIMHANS', 'Bengaluru, KA', 'Dr. Priya', '080-46110007');

INSERT INTO users (id, email, password_hash, role, hospital_id, name, created_at) VALUES
('admin1', 'admin@hemolink.in', 'hash', 'admin', NULL, 'System Admin', DATE '2025-01-01'),
('hosp_h1', 'manipal@hemolink.in', 'hash', 'hospital', 'h1', 'Manipal Hospital', DATE '2025-01-01'),
('hosp_h2', 'fortis@hemolink.in', 'hash', 'hospital', 'h2', 'Fortis Healthcare', DATE '2025-01-01'),
('hosp_h3', 'apollo@hemolink.in', 'hash', 'hospital', 'h3', 'Apollo Hospitals', DATE '2025-01-01'),
('hosp_h4', 'aiims@hemolink.in', 'hash', 'hospital', 'h4', 'AIIMS Delhi', DATE '2025-01-01');

INSERT INTO donors (id, user_id, name, email, blood_type, phone, dob, last_donation, medical_clearance, address, emergency_contact, status) VALUES
('d1', NULL, 'Arjun Mehta', 'arjun@example.com', 'O-', '9876543210', DATE '1995-03-15', DATE '2025-03-10', TRUE, 'Koramangala, Bengaluru', '9876500001', 'Active'),
('d2', NULL, 'Priya Sharma', 'priya@example.com', 'A+', '9123456789', DATE '1992-07-22', DATE '2025-01-20', TRUE, 'Indiranagar, Bengaluru', '9123400001', 'Active'),
('d3', NULL, 'Ravi Kumar', 'ravi@example.com', 'B+', '9988776655', DATE '1988-11-05', DATE '2024-11-05', TRUE, 'T.Nagar, Chennai', '9988700001', 'Active'),
('d4', NULL, 'Sneha Iyer', 'sneha@example.com', 'AB+', '9765432101', DATE '1998-04-01', DATE '2025-04-01', FALSE, 'Connaught Place, Delhi', '9765400001', 'Active'),
('d5', NULL, 'Karan Patel', 'karan@example.com', 'O+', '9654321012', DATE '1990-06-18', DATE '2024-12-01', TRUE, 'Whitefield, Bengaluru', '9654300001', 'Active');

-- Dates relative to CURRENT_DATE so SOS/routing always see non-expired stock after restart
INSERT INTO inventory (id, blood_type, collection_date, expiry_date, status, donor_id, hospital_id) VALUES
('inv1', 'O-', DATEADD('MONTH', -1, CURRENT_DATE), DATEADD('MONTH', 2, CURRENT_DATE), 'Available', 'd1', 'h1'),
('inv2', 'O-', DATEADD('MONTH', -1, CURRENT_DATE), DATEADD('MONTH', 2, CURRENT_DATE), 'Available', NULL, 'h1'),
('inv3', 'A+', DATEADD('MONTH', -1, CURRENT_DATE), DATEADD('MONTH', 2, CURRENT_DATE), 'Available', 'd2', 'h1'),
('inv4', 'B+', DATEADD('DAY', -20, CURRENT_DATE), DATEADD('MONTH', 2, CURRENT_DATE), 'Available', 'd3', 'h2'),
('inv5', 'O+', DATEADD('DAY', -25, CURRENT_DATE), DATEADD('MONTH', 2, CURRENT_DATE), 'Available', NULL, 'h2'),
('inv6', 'A-', DATEADD('DAY', -15, CURRENT_DATE), DATEADD('MONTH', 2, CURRENT_DATE), 'Available', NULL, 'h3'),
('inv7', 'B-', DATEADD('DAY', -10, CURRENT_DATE), DATEADD('MONTH', 2, CURRENT_DATE), 'Available', NULL, 'h3'),
('inv8', 'AB+', DATEADD('DAY', -5, CURRENT_DATE), DATEADD('MONTH', 3, CURRENT_DATE), 'Available', 'd4', 'h4'),
('inv9', 'O+', DATEADD('DAY', -5, CURRENT_DATE), DATEADD('MONTH', 2, CURRENT_DATE), 'Reserved', NULL, 'h1'),
('inv10', 'A+', DATEADD('MONTH', -3, CURRENT_DATE), DATEADD('DAY', -1, CURRENT_DATE), 'Expired', NULL, 'h2'),
('inv11', 'B+', DATEADD('DAY', -7, CURRENT_DATE), DATEADD('MONTH', 2, CURRENT_DATE), 'Available', 'd5', 'h5'),
('inv12', 'O+', DATEADD('DAY', -3, CURRENT_DATE), DATEADD('MONTH', 2, CURRENT_DATE), 'Available', NULL, 'h5');

INSERT INTO blood_requests (id, hospital_id, blood_type, quantity, urgency, status, notes, created_at, fulfilled_at) VALUES
('req1', 'h1', 'O-', 2, 'Critical', 'Pending', 'Trauma patient', DATE '2025-05-14', NULL),
('req2', 'h2', 'AB+', 1, 'High', 'Fulfilled', 'Surgery', DATE '2025-05-10', DATE '2025-05-11'),
('req3', 'h3', 'B+', 3, 'Medium', 'Pending', 'Elective', DATE '2025-05-13', NULL);

INSERT INTO hospital_edges (from_hospital_id, to_hospital_id, distance_km) VALUES
('h1', 'h2', 5), ('h1', 'h3', 12), ('h1', 'h4', 8),
('h2', 'h1', 5), ('h2', 'h3', 7), ('h2', 'h5', 15),
('h3', 'h1', 12), ('h3', 'h2', 7), ('h3', 'h4', 3), ('h3', 'h5', 9),
('h4', 'h1', 8), ('h4', 'h3', 3), ('h4', 'h5', 6),
('h5', 'h2', 15), ('h5', 'h3', 9), ('h5', 'h4', 6);

INSERT INTO hospital_blood_capacity (hospital_id, blood_type, target_units) VALUES
('h1', 'O-', 8), ('h1', 'O+', 12), ('h1', 'A+', 10), ('h1', 'A-', 6),
('h1', 'B+', 8), ('h1', 'B-', 5), ('h1', 'AB+', 4), ('h1', 'AB-', 3),
('h2', 'O-', 6), ('h2', 'O+', 10), ('h2', 'A+', 8), ('h2', 'A-', 5),
('h2', 'B+', 8), ('h2', 'B-', 4), ('h2', 'AB+', 3), ('h2', 'AB-', 2),
('h3', 'O-', 7), ('h3', 'O+', 11), ('h3', 'A+', 9), ('h3', 'A-', 5),
('h3', 'B+', 7), ('h3', 'B-', 4), ('h3', 'AB+', 3), ('h3', 'AB-', 2);

INSERT INTO activity_log (id, event_time, message, type) VALUES
('a1', '2025-05-14 09:12', 'Critical request REQ-001 received at Manipal', 'alert'),
('a2', '2025-05-11 11:05', 'REQ-002 fulfilled for Fortis Healthcare', 'success'),
('a3', '2025-05-10 14:30', 'New inventory batch added at Manipal', 'info');

INSERT INTO organ_donors (id, donor_id, name, blood_type, phone, organs, hospital_id, registered_at, status, notes) VALUES
('od1', 'd1', 'Arjun Mehta', 'O-', '9876543210', 'Kidney,Cornea', 'h1', DATE '2025-01-15', 'Active', 'Healthy, no prior surgeries'),
('od2', 'd2', 'Priya Sharma', 'A+', '9123456789', 'Liver,Kidney,Cornea', 'h1', DATE '2025-02-20', 'Active', 'Non-smoker, no chronic illness'),
('od3', 'd5', 'Karan Patel', 'O+', '9654321012', 'Heart,Lungs,Kidney', 'h2', DATE '2025-03-10', 'Active', 'Athlete, excellent health');
