package com.hemolink.model;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record CreateBloodRequestRequest(
        @NotBlank String hospitalId,
        @NotBlank String bloodType,
        @NotNull @Min(1) @Max(20) Integer quantity,
        @NotBlank String urgency,
        String notes) {
}
