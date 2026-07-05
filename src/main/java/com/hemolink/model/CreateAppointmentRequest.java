package com.hemolink.model;

import jakarta.validation.constraints.NotBlank;

public record CreateAppointmentRequest(
        @NotBlank String userId,
        @NotBlank String hospitalId,
        @NotBlank String donationType,
        @NotBlank String appointmentDate,
        String notes) {
}
