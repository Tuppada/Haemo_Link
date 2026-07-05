package com.hemolink.model;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;

import java.util.List;

public record SaveHospitalCapacityRequest(
        @NotEmpty List<@Valid CapacityEntry> capacities) {

    public record CapacityEntry(
            @NotBlank String bloodType,
            @Min(1) int targetUnits) {
    }
}
