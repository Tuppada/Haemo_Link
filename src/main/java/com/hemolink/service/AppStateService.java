package com.hemolink.service;

import com.hemolink.model.ActivityLogRecord;
import com.hemolink.model.AppState;
import com.hemolink.model.BloodCapacityRecord;
import com.hemolink.model.SaveHospitalCapacityRequest;
import com.hemolink.model.AppointmentRecord;
import com.hemolink.model.BloodRequestRecord;
import com.hemolink.model.CreateAppointmentRequest;
import com.hemolink.model.CreateBloodRequestRequest;
import com.hemolink.model.CreateDonorRequest;
import com.hemolink.model.CreateInventoryRequest;
import com.hemolink.model.CreateOrganDonorRequest;
import com.hemolink.model.DonorRecord;
import com.hemolink.model.Hospital;
import com.hemolink.model.InventoryUnit;
import com.hemolink.model.LoginRequest;
import com.hemolink.model.LoginResponse;
import com.hemolink.model.MatchResult;
import com.hemolink.model.OrganDonorRecord;
import com.hemolink.model.RegisterDonorRequest;
import com.hemolink.model.RequestSubmissionResponse;
import com.hemolink.model.UserRecord;
import com.hemolink.security.AuthUser;
import com.hemolink.security.JwtService;
import com.hemolink.security.SecurityUtils;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

@Service
public class AppStateService {

    private final JdbcTemplate jdbcTemplate;
    private final HemoLinkService hemoLinkService;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;

    public AppStateService(
            JdbcTemplate jdbcTemplate,
            HemoLinkService hemoLinkService,
            PasswordEncoder passwordEncoder,
            JwtService jwtService) {
        this.jdbcTemplate = jdbcTemplate;
        this.hemoLinkService = hemoLinkService;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
    }

    public AppState getState() {
        jdbcTemplate.update(
                "update inventory set status='Expired' where status='Available' and expiry_date < CURRENT_DATE");
        return new AppState(
                jdbcTemplate.query("select * from donors order by name", this::mapDonor),
                jdbcTemplate.query("select id, name, location, contact, phone from hospitals order by id", this::mapHospital),
                jdbcTemplate.query("select * from inventory order by collection_date desc, id desc", this::mapInventory),
                jdbcTemplate.query("select * from blood_requests order by created_at desc, id desc", this::mapRequest),
                jdbcTemplate.query("select * from activity_log order by event_time desc, id desc", this::mapActivity),
                jdbcTemplate.query("select * from organ_donors order by registered_at desc", this::mapOrganDonor),
                jdbcTemplate.query("select * from appointments order by appointment_date desc, id desc", this::mapAppointment),
                jdbcTemplate.query(
                        "select hospital_id, blood_type, target_units from hospital_blood_capacity order by hospital_id, blood_type",
                        this::mapBloodCapacity)
        );
    }

    public UserRecord getUserById(String userId) {
        try {
            return jdbcTemplate.queryForObject(
                    "select id, email, role, hospital_id, name, created_at from users where id=?",
                    this::mapUser,
                    userId);
        } catch (org.springframework.dao.EmptyResultDataAccessException ex) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found.");
        }
    }

    @Transactional
    public AppState saveHospitalCapacity(String hospitalId, SaveHospitalCapacityRequest request) {
        AuthUser current = SecurityUtils.requireUser();
        SecurityUtils.requireHospitalAccess(current, hospitalId);
        Integer hospitalExists = jdbcTemplate.queryForObject(
                "select count(*) from hospitals where id=?", Integer.class, hospitalId);
        if (hospitalExists == null || hospitalExists == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Hospital not found.");
        }
        jdbcTemplate.update("delete from hospital_blood_capacity where hospital_id=?", hospitalId);
        for (SaveHospitalCapacityRequest.CapacityEntry entry : request.capacities()) {
            jdbcTemplate.update(
                    "insert into hospital_blood_capacity (hospital_id, blood_type, target_units) values (?, ?, ?)",
                    hospitalId, entry.bloodType(), entry.targetUnits());
        }
        String hospitalName = jdbcTemplate.queryForObject(
                "select name from hospitals where id=?", String.class, hospitalId);
        addActivity("Blood capacity targets updated for " + hospitalName, "info");
        return getState();
    }

    public List<AppointmentRecord> getAppointmentsForUser(String userId) {
        SecurityUtils.requireSelfOrAdmin(SecurityUtils.requireUser(), userId);
        return jdbcTemplate.query(
                "select * from appointments where user_id=? order by appointment_date desc, id desc",
                this::mapAppointment,
                userId
        );
    }

    public LoginResponse login(LoginRequest request) {
        List<UserWithPassword> users = jdbcTemplate.query(
                "select id, email, role, hospital_id, name, created_at, password_hash from users where lower(email)=lower(?)",
                this::mapUserWithPassword,
                request.email()
        );
        if (users.isEmpty() || !passwordEncoder.matches(request.password(), users.get(0).passwordHash())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid email or password.");
        }
        UserWithPassword user = users.get(0);
        UserRecord record = new UserRecord(user.id(), user.email(), user.role(), user.hospitalId(), user.name(), user.createdAt());
        return new LoginResponse(record, jwtService.generateToken(record));
    }

    @Transactional
    public LoginResponse registerDonor(RegisterDonorRequest request) {
        Integer existing = jdbcTemplate.queryForObject(
                "select count(*) from users where lower(email)=lower(?)",
                Integer.class,
                request.email()
        );
        if (existing != null && existing > 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Email already registered.");
        }
        String userId = "user_" + System.currentTimeMillis();
        String donorId = "d" + System.currentTimeMillis();
        LocalDate createdAt = LocalDate.now();

        jdbcTemplate.update(
                "insert into users (id, email, password_hash, role, hospital_id, name, created_at) values (?, ?, ?, ?, ?, ?, ?)",
                userId, request.email(), passwordEncoder.encode(request.password()), "donor", null, request.name(), createdAt
        );
        jdbcTemplate.update(
                "insert into donors (id, user_id, name, email, blood_type, phone, dob, last_donation, medical_clearance, address, emergency_contact, status) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                donorId, userId, request.name(), request.email(), request.bloodType(), request.phone(),
                parseDateOrNull(request.dob()), parseDateOrNull(request.lastDonation()),
                true, nullIfBlank(request.address()), nullIfBlank(request.emergencyContact()), "Active"
        );
        addActivity("New donor registered: " + request.name() + " (" + request.bloodType() + ")", "success");
        UserRecord record = jdbcTemplate.queryForObject(
                "select id, email, role, hospital_id, name, created_at from users where id=?",
                this::mapUser, userId
        );
        return new LoginResponse(record, jwtService.generateToken(record));
    }

    @Transactional
    public void createDonor(CreateDonorRequest request) {
        SecurityUtils.requireAdmin(SecurityUtils.requireUser());
        String donorId = "d" + System.currentTimeMillis();
        jdbcTemplate.update(
                "insert into donors (id, user_id, name, email, blood_type, phone, dob, last_donation, medical_clearance, address, emergency_contact, status) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                donorId, null, request.name(), request.email(), request.bloodType(), request.phone(),
                parseDateOrNull(request.dob()), parseDateOrNull(request.lastDonation()),
                true, nullIfBlank(request.address()), nullIfBlank(request.emergencyContact()), "Active"
        );
        addActivity("Admin added donor: " + request.name() + " (" + request.bloodType() + ")", "info");
    }

    @Transactional
    public void toggleDonorClearance(String donorId) {
        SecurityUtils.requireAdmin(SecurityUtils.requireUser());
        Boolean current = jdbcTemplate.queryForObject(
                "select medical_clearance from donors where id=?", Boolean.class, donorId);
        if (current == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Donor not found.");
        }
        jdbcTemplate.update("update donors set medical_clearance=? where id=?", !current, donorId);
        addActivity("Medical clearance toggled for donor " + donorId, "info");
    }

    @Transactional
    public void createInventory(CreateInventoryRequest request) {
        AuthUser current = SecurityUtils.requireUser();
        SecurityUtils.requireHospitalAccess(current, request.hospitalId());
        String inventoryId = "inv" + System.currentTimeMillis();
        jdbcTemplate.update(
                "insert into inventory (id, blood_type, collection_date, expiry_date, status, donor_id, hospital_id) values (?, ?, ?, ?, ?, ?, ?)",
                inventoryId, request.bloodType(),
                LocalDate.parse(request.collectionDate()), LocalDate.parse(request.expiryDate()),
                "Available", null, request.hospitalId()
        );
        String hospitalName = jdbcTemplate.queryForObject(
                "select name from hospitals where id=?", String.class, request.hospitalId());
        addActivity("New " + request.bloodType() + " unit added at " + hospitalName, "info");
    }

    @Transactional
    public AppState createOrganDonor(CreateOrganDonorRequest request) {
        AuthUser current = SecurityUtils.requireUser();
        if (!current.isAdmin() && !current.isHospital() && !current.isDonor()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Not allowed to register organ donors.");
        }
        String id = "od" + System.currentTimeMillis();
        String organsStr = String.join(",", request.organs());
        jdbcTemplate.update(
                "insert into organ_donors (id, donor_id, name, blood_type, phone, organs, hospital_id, registered_at, status, notes) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                id,
                nullIfBlank(request.donorId()),
                request.name(),
                request.bloodType(),
                request.phone(),
                organsStr,
                nullIfBlank(request.hospitalId()),
                LocalDate.now(),
                "Active",
                nullIfBlank(request.notes())
        );
        addActivity("Organ donor registered: " + request.name() + " (" + String.join(", ", request.organs()) + ")", "success");
        return getState();
    }

    @Transactional
    public AppointmentRecord createAppointment(CreateAppointmentRequest request) {
        SecurityUtils.requireSelfOrAdmin(SecurityUtils.requireUser(), request.userId());
        Integer userExists = jdbcTemplate.queryForObject(
                "select count(*) from users where id=?", Integer.class, request.userId());
        if (userExists == null || userExists == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found.");
        }
        String id = "appt" + System.currentTimeMillis();
        LocalDate today = LocalDate.now();
        jdbcTemplate.update(
                "insert into appointments (id, user_id, hospital_id, donation_type, appointment_date, notes, status, booked_at) values (?, ?, ?, ?, ?, ?, ?, ?)",
                id,
                request.userId(),
                request.hospitalId(),
                request.donationType(),
                LocalDate.parse(request.appointmentDate()),
                nullIfBlank(request.notes()),
                "Scheduled",
                today
        );
        String hospitalName = jdbcTemplate.queryForObject(
                "select name from hospitals where id=?", String.class, request.hospitalId());
        addActivity("Appointment booked at " + hospitalName + " on " + request.appointmentDate(), "info");
        return jdbcTemplate.queryForObject("select * from appointments where id=?", this::mapAppointment, id);
    }

    @Transactional
    public void cancelAppointment(String appointmentId, String userId) {
        SecurityUtils.requireSelfOrAdmin(SecurityUtils.requireUser(), userId);
        int updated = jdbcTemplate.update(
                "delete from appointments where id=? and user_id=?",
                appointmentId, userId
        );
        if (updated == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Appointment not found.");
        }
        addActivity("Appointment cancelled: " + appointmentId, "info");
    }

    @Transactional
    public BloodRequestRecord fulfillRequest(String requestId) {
        SecurityUtils.requireAdminOrHospital(SecurityUtils.requireUser());
        AppState state = getState();
        BloodRequestRecord request = state.requests().stream()
                .filter(r -> r.id().equals(requestId)).findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Request not found."));
        var result = hemoLinkService.matchRequest(state.inventory(), request.bloodType(), request.quantity(), request.hospitalId());
        if (!result.canFulfill()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Insufficient local stock for this request.");
        }
        for (InventoryUnit unit : result.matches()) {
            jdbcTemplate.update("update inventory set status='Reserved' where id=?", unit.id());
        }
        jdbcTemplate.update("update blood_requests set status='Fulfilled', fulfilled_at=? where id=?",
                LocalDate.now(), requestId);
        addActivity("Request " + requestId + " fulfilled — " + result.matches().size() + " unit(s) reserved", "success");
        return jdbcTemplate.queryForObject("select * from blood_requests where id=?", this::mapRequest, requestId);
    }

    @Transactional
    public RequestSubmissionResponse submitRequest(CreateBloodRequestRequest request) {
        AuthUser current = SecurityUtils.requireUser();
        if (current.isHospital()) {
            SecurityUtils.requireHospitalAccess(current, request.hospitalId());
        } else if (!current.isAdmin()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only hospitals or admins can submit blood requests.");
        }
        AppState state = getState();
        var localResult = hemoLinkService.matchRequest(state.inventory(), request.bloodType(), request.quantity(), request.hospitalId());
        boolean fulfilledLocally = localResult.canFulfill();
        String requestId = "req" + System.currentTimeMillis();
        LocalDate today = LocalDate.now();
        String status = fulfilledLocally ? "Fulfilled" : "Pending";

        jdbcTemplate.update(
                "insert into blood_requests (id, hospital_id, blood_type, quantity, urgency, status, notes, created_at, fulfilled_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                requestId, request.hospitalId(), request.bloodType(), request.quantity(),
                request.urgency(), status, nullIfBlank(request.notes()), today,
                fulfilledLocally ? today : null
        );
        if (fulfilledLocally) {
            for (InventoryUnit unit : localResult.matches()) {
                jdbcTemplate.update("update inventory set status='Reserved' where id=?", unit.id());
            }
            addActivity(request.hospitalId() + ": " + request.bloodType() + " request auto-fulfilled", "success");
        } else {
            addActivity(request.hospitalId() + ": " + request.urgency() + " request for " + request.bloodType() + " — routing to network", "alert");
        }
        BloodRequestRecord saved = jdbcTemplate.queryForObject(
                "select * from blood_requests where id=?", this::mapRequest, requestId);
        List<MatchResult> nearby = fulfilledLocally ? List.of()
                : hemoLinkService.findNearestMatches(state.hospitals(), state.inventory(), request.hospitalId(), request.bloodType(), request.quantity());
        return new RequestSubmissionResponse(saved, fulfilledLocally, nearby);
    }

    private void addActivity(String message, String type) {
        jdbcTemplate.update(
                "insert into activity_log (id, event_time, message, type) values (?, ?, ?, ?)",
                "a" + UUID.randomUUID().toString().replace("-", "").substring(0, 10),
                LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")),
                message, type
        );
    }

    private UserRecord mapUser(ResultSet rs, int r) throws SQLException {
        return new UserRecord(rs.getString("id"), rs.getString("email"), rs.getString("role"),
                rs.getString("hospital_id"), rs.getString("name"), toString(rs.getDate("created_at")));
    }

    private UserWithPassword mapUserWithPassword(ResultSet rs, int r) throws SQLException {
        return new UserWithPassword(
                rs.getString("id"),
                rs.getString("email"),
                rs.getString("role"),
                rs.getString("hospital_id"),
                rs.getString("name"),
                toString(rs.getDate("created_at")),
                rs.getString("password_hash")
        );
    }

    private DonorRecord mapDonor(ResultSet rs, int r) throws SQLException {
        return new DonorRecord(rs.getString("id"), rs.getString("user_id"), rs.getString("name"),
                rs.getString("email"), rs.getString("blood_type"), rs.getString("phone"),
                toString(rs.getDate("dob")), toString(rs.getDate("last_donation")),
                rs.getBoolean("medical_clearance"), rs.getString("address"),
                rs.getString("emergency_contact"), rs.getString("status"));
    }

    private Hospital mapHospital(ResultSet rs, int r) throws SQLException {
        return new Hospital(rs.getString("id"), rs.getString("name"), rs.getString("location"),
                rs.getString("contact"), rs.getString("phone"));
    }

    private InventoryUnit mapInventory(ResultSet rs, int r) throws SQLException {
        return new InventoryUnit(rs.getString("id"), rs.getString("blood_type"),
                rs.getDate("collection_date").toLocalDate(), rs.getDate("expiry_date").toLocalDate(),
                rs.getString("status"), rs.getString("donor_id"), rs.getString("hospital_id"));
    }

    private BloodRequestRecord mapRequest(ResultSet rs, int r) throws SQLException {
        return new BloodRequestRecord(rs.getString("id"), rs.getString("hospital_id"),
                rs.getString("blood_type"), rs.getInt("quantity"), rs.getString("urgency"),
                rs.getString("status"), rs.getString("notes"), toString(rs.getDate("created_at")),
                toString(rs.getDate("fulfilled_at")));
    }

    private ActivityLogRecord mapActivity(ResultSet rs, int r) throws SQLException {
        return new ActivityLogRecord(rs.getString("id"), rs.getString("event_time"),
                rs.getString("message"), rs.getString("type"));
    }

    private OrganDonorRecord mapOrganDonor(ResultSet rs, int r) throws SQLException {
        String organsStr = rs.getString("organs");
        List<String> organs = organsStr != null && !organsStr.isBlank()
                ? Arrays.asList(organsStr.split(","))
                : List.of();
        return new OrganDonorRecord(rs.getString("id"), rs.getString("donor_id"),
                rs.getString("name"), rs.getString("blood_type"), rs.getString("phone"),
                organs, rs.getString("hospital_id"), toString(rs.getDate("registered_at")),
                rs.getString("status"), rs.getString("notes"));
    }

    private BloodCapacityRecord mapBloodCapacity(ResultSet rs, int r) throws SQLException {
        return new BloodCapacityRecord(
                rs.getString("hospital_id"),
                rs.getString("blood_type"),
                rs.getInt("target_units"));
    }

    private AppointmentRecord mapAppointment(ResultSet rs, int r) throws SQLException {
        return new AppointmentRecord(
                rs.getString("id"),
                rs.getString("user_id"),
                rs.getString("hospital_id"),
                rs.getString("donation_type"),
                toString(rs.getDate("appointment_date")),
                rs.getString("notes"),
                rs.getString("status"),
                toString(rs.getDate("booked_at"))
        );
    }

    private LocalDate parseDateOrNull(String value) {
        return value == null || value.isBlank() ? null : LocalDate.parse(value);
    }

    private String nullIfBlank(String value) {
        return value == null || value.isBlank() ? null : value;
    }

    private String toString(java.sql.Date date) {
        return date == null ? null : date.toLocalDate().toString();
    }

    private record UserWithPassword(
            String id,
            String email,
            String role,
            String hospitalId,
            String name,
            String createdAt,
            String passwordHash) {
    }
}
