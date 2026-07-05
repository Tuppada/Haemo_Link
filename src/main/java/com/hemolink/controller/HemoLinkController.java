package com.hemolink.controller;

import com.hemolink.model.AiChatRequest;
import com.hemolink.model.AiChatResponse;
import com.hemolink.model.AppState;
import com.hemolink.model.SaveHospitalCapacityRequest;
import com.hemolink.model.AppointmentRecord;
import com.hemolink.model.BloodRequest;
import com.hemolink.model.BloodRequestRecord;
import com.hemolink.model.CreateAppointmentRequest;
import com.hemolink.model.CreateBloodRequestRequest;
import com.hemolink.model.CreateDonorRequest;
import com.hemolink.model.CreateInventoryRequest;
import com.hemolink.model.CreateOrganDonorRequest;
import com.hemolink.model.LoginRequest;
import com.hemolink.model.LoginResponse;
import com.hemolink.security.AuthUser;
import com.hemolink.security.SecurityUtils;
import com.hemolink.model.MatchResult;
import com.hemolink.model.RegisterDonorRequest;
import com.hemolink.model.RequestSubmissionResponse;
import com.hemolink.model.UserRecord;
import com.hemolink.service.AnthropicService;
import com.hemolink.service.AppStateService;
import com.hemolink.service.HemoLinkService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.security.core.annotation.AuthenticationPrincipal;

import java.util.List;
import java.util.Map;

@CrossOrigin(origins = "*")
@RestController
@RequestMapping("/api")
public class HemoLinkController {

    private final HemoLinkService hemoLinkService;
    private final AnthropicService anthropicService;
    private final AppStateService appStateService;

    public HemoLinkController(
            HemoLinkService hemoLinkService,
            AnthropicService anthropicService,
            AppStateService appStateService) {
        this.hemoLinkService = hemoLinkService;
        this.anthropicService = anthropicService;
        this.appStateService = appStateService;
    }

    @GetMapping("/health")
    public Map<String, String> health() {
        return Map.of("status", "ok", "service", "hemolink-backend", "ai", "claude");
    }

    @GetMapping("/state")
    public AppState state() {
        return appStateService.getState();
    }

    @GetMapping("/appointments")
    public List<AppointmentRecord> appointments(@RequestParam String userId) {
        return appStateService.getAppointmentsForUser(userId);
    }

    @PostMapping("/auth/login")
    public LoginResponse login(@Valid @RequestBody LoginRequest request) {
        return appStateService.login(request);
    }

    @PostMapping("/auth/register-donor")
    public LoginResponse registerDonor(@Valid @RequestBody RegisterDonorRequest request) {
        return appStateService.registerDonor(request);
    }

    @GetMapping("/auth/me")
    public UserRecord me(@AuthenticationPrincipal AuthUser user) {
        AuthUser auth = user != null ? user : SecurityUtils.requireUser();
        return appStateService.getUserById(auth.id());
    }

    @PostMapping("/matches")
    public List<MatchResult> matches(@Valid @RequestBody BloodRequest request) {
        return hemoLinkService.findNearestMatches(request);
    }

    @PostMapping("/donors")
    public AppState createDonor(@Valid @RequestBody CreateDonorRequest request) {
        appStateService.createDonor(request);
        return appStateService.getState();
    }

    @PatchMapping("/donors/{id}/clearance")
    public AppState toggleClearance(@PathVariable String id) {
        appStateService.toggleDonorClearance(id);
        return appStateService.getState();
    }

    @PostMapping("/inventory")
    public AppState createInventory(@Valid @RequestBody CreateInventoryRequest request) {
        appStateService.createInventory(request);
        return appStateService.getState();
    }

    @PutMapping("/hospitals/{hospitalId}/capacity")
    public AppState saveHospitalCapacity(
            @PathVariable String hospitalId,
            @Valid @RequestBody SaveHospitalCapacityRequest request) {
        return appStateService.saveHospitalCapacity(hospitalId, request);
    }

    @PostMapping("/requests")
    public RequestSubmissionResponse createRequest(@Valid @RequestBody CreateBloodRequestRequest request) {
        return appStateService.submitRequest(request);
    }

    @PostMapping("/requests/{id}/fulfill")
    public BloodRequestRecord fulfillRequest(@PathVariable String id) {
        return appStateService.fulfillRequest(id);
    }

    @PostMapping("/organ-donors")
    public AppState createOrganDonor(@Valid @RequestBody CreateOrganDonorRequest request) {
        appStateService.createOrganDonor(request);
        return appStateService.getState();
    }

    @PostMapping("/appointments")
    public AppointmentRecord createAppointment(@Valid @RequestBody CreateAppointmentRequest request) {
        return appStateService.createAppointment(request);
    }

    @DeleteMapping("/appointments/{id}")
    public Map<String, String> cancelAppointment(@PathVariable String id, @RequestParam String userId) {
        appStateService.cancelAppointment(id, userId);
        return Map.of("status", "cancelled");
    }

    @PostMapping("/ai/chat")
    public AiChatResponse chat(@RequestBody AiChatRequest request) {
        return anthropicService.chat(request.prompt(), request.system(), request.messages());
    }
}
